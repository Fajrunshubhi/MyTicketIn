import { NextResponse } from "next/server";
import { AppError, query } from "@/lib/server/http";
import { withPayoutReportDocument } from "@/lib/payout-report-integrity";
import { buildPayoutReportCsv, type PayoutReport } from "@/lib/payout-report";
import { buildPayoutReportPdfBytes } from "@/lib/payout-report-pdf";

function money(value: unknown): number {
  return Math.max(0, Math.trunc(Number(value || 0)));
}

function maskAccount(value: string | null | undefined): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 4) return digits ? "****" : "";
  return `${"*".repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

export async function loadPayoutReport(eventId: string, organizerProfileId: string): Promise<PayoutReport> {
  const events = await query<{
    id: string;
    title: string;
    venue_name: string;
    city: string;
    province: string;
    starts_at: string | null;
    ends_at: string | null;
    timezone: string;
    organizer_name: string;
    bank_name: string | null;
    bank_account_name: string | null;
    bank_account_number: string | null;
  }>(
    `SELECT e.id, e.title, e.venue_name, e.city, e.province, e.starts_at::text, e.ends_at::text, e.timezone,
            p.name AS organizer_name, p.bank_name, p.bank_account_name, p.bank_account_number
     FROM events e
     JOIN organizer_profiles p ON p.id = e.organizer_profile_id
     WHERE e.id=$1 AND e.organizer_profile_id=$2 LIMIT 1`,
    [eventId, organizerProfileId],
  );
  const event = events[0];
  if (!event) throw new AppError("NOT_FOUND", "Event tidak ditemukan.", {}, 404);

  const [totals, holderRows, refundRows, payoutRows] = await Promise.all([
    query<{ gross: string; refunded: string; order_n: string; ticket_n: string }>(
      `SELECT
         COALESCE((SELECT SUM(o.total_payable_rupiah) FROM orders o
                   WHERE o.event_id = $1 AND o.status IN ('PAID'::order_status, 'REFUNDED'::order_status)), 0)::text AS gross,
         COALESCE((SELECT SUM(rf.amount_rupiah) FROM refunds rf JOIN orders o ON o.id = rf.order_id
                   WHERE o.event_id = $1 AND rf.status = 'COMPLETED'::refund_status), 0)::text AS refunded,
         (SELECT COUNT(*) FROM orders o
          WHERE o.event_id = $1 AND o.status IN ('PAID'::order_status, 'REFUNDED'::order_status))::text AS order_n,
         (SELECT COUNT(*) FROM tickets t JOIN orders o ON o.id = t.order_id
          WHERE t.event_id = $1 AND o.status IN ('PAID'::order_status, 'REFUNDED'::order_status))::text AS ticket_n`,
      [eventId],
    ),
    query<{
      ticket_number: string;
      order_number: string;
      holder_name: string;
      holder_email: string;
      holder_phone: string;
      holder_nik: string;
      ticket_type_name: string | null;
      section_name: string | null;
      seat_label: string | null;
      ticket_status: string;
      unit_price: string;
      order_payable: string;
      order_refunded: string;
    }>(
      `SELECT t.ticket_number, o.order_number,
              COALESCE(NULLIF(btrim(t.holder_full_name), ''), a.full_name, u.name, '') AS holder_name,
              COALESCE(NULLIF(btrim(t.holder_email), ''), a.email, u.email, '') AS holder_email,
              COALESCE(NULLIF(btrim(t.holder_phone), ''), a.phone, '') AS holder_phone,
              COALESCE(NULLIF(t.holder_identity_number, '0000000000000000'), a.identity_number, '') AS holder_nik,
              t.ticket_type_name, t.section_name, t.seat_label, t.status::text AS ticket_status,
              COALESCE(oi.unit_price_rupiah, 0)::text AS unit_price,
              o.total_payable_rupiah::text AS order_payable,
              COALESCE((
                SELECT SUM(rf.amount_rupiah) FROM refunds rf
                WHERE rf.order_id = o.id AND rf.status = 'COMPLETED'::refund_status
              ), 0)::text AS order_refunded
       FROM tickets t
       JOIN orders o ON o.id = t.order_id
       JOIN users u ON u.id = t.owner_user_id
       LEFT JOIN order_items oi ON oi.id = t.order_item_id
       LEFT JOIN order_attendees a ON a.order_item_id = t.order_item_id AND a.unit_sequence = t.unit_sequence
       WHERE t.event_id=$1 AND o.status IN ('PAID'::order_status, 'REFUNDED'::order_status)
       ORDER BY t.issued_at ASC, t.id ASC
       LIMIT 5000`,
      [eventId],
    ),
    query<{ refund_number: string; order_number: string; amount: string; source: string | null; completed_at: string | null }>(
      `SELECT rf.refund_number, o.order_number, rf.amount_rupiah::text AS amount,
              rf.source AS source, rf.completed_at::text
       FROM refunds rf
       JOIN orders o ON o.id = rf.order_id
       WHERE o.event_id=$1 AND rf.status = 'COMPLETED'::refund_status
       ORDER BY rf.completed_at ASC NULLS LAST, rf.id ASC`,
      [eventId],
    ),
    query<{
      payout_number: string;
      amount: string;
      status: string;
      bank_name: string | null;
      bank_account_name: string | null;
      bank_account_number: string | null;
    }>(
      `SELECT payout_number, amount_rupiah::text AS amount, status,
              bank_name, bank_account_name, bank_account_number
       FROM organizer_payouts
       WHERE event_id=$1 AND status <> 'REJECTED'
       ORDER BY requested_at DESC LIMIT 1`,
      [eventId],
    ),
  ]);

  const holders = holderRows.map((r) => ({
    ticketNumber: r.ticket_number,
    orderNumber: r.order_number,
    holderName: r.holder_name,
    holderEmail: r.holder_email,
    holderPhone: r.holder_phone,
    holderIdentityNumber: r.holder_nik === "0000000000000000" ? "" : r.holder_nik,
    ticketTypeName: r.ticket_type_name || "",
    sectionName: r.section_name || "",
    seatLabel: r.seat_label || "",
    ticketStatus: r.ticket_status,
    unitPriceRupiah: money(r.unit_price),
    orderPayableRupiah: money(r.order_payable),
    orderRefundedRupiah: money(r.order_refunded),
  }));
  const refunds = refundRows.map((r) => ({
    refundNumber: r.refund_number,
    orderNumber: r.order_number,
    amountRupiah: money(r.amount),
    source: r.source || undefined,
    completedAt: r.completed_at,
  }));
  const tot = totals[0];
  const grossRupiah = money(tot?.gross);
  const refundedRupiah = money(tot?.refunded);
  const payout = payoutRows[0];

  const bankName = payout?.bank_name || event.bank_name || null;
  const bankAccountName = payout?.bank_account_name || event.bank_account_name || null;
  const bankAccountNumber = payout?.bank_account_number || event.bank_account_number || null;
  return withPayoutReportDocument({
    eventId: event.id,
    eventTitle: event.title,
    venueLine: [event.venue_name, event.city, event.province].filter(Boolean).join(", "),
    startsAt: event.starts_at ? new Date(event.starts_at).toISOString() : null,
    endsAt: event.ends_at ? new Date(event.ends_at).toISOString() : null,
    timezone: event.timezone || "Asia/Jakarta",
    organizerName: event.organizer_name,
    payoutNumber: payout?.payout_number || null,
    payoutStatus: payout?.status || null,
    payoutAmountRupiah: payout ? money(payout.amount) : null,
    bankName,
    bankAccountName,
    bankAccountMasked: maskAccount(bankAccountNumber),
    grossRupiah,
    refundedRupiah,
    netRupiah: Math.max(0, grossRupiah - refundedRupiah),
    paidOrderCount: money(tot?.order_n),
    ticketCount: money(tot?.ticket_n),
    holders,
    refunds,
  });
}

export async function loadPayoutReportByPayoutId(payoutId: string): Promise<PayoutReport> {
  const rows = await query<{
    event_id: string;
    organizer_profile_id: string;
    payout_number: string;
    amount: string;
    status: string;
    bank_name: string | null;
    bank_account_name: string | null;
    bank_account_number: string | null;
  }>(
    `SELECT event_id, organizer_profile_id, payout_number, amount_rupiah::text AS amount, status,
            bank_name, bank_account_name, bank_account_number
     FROM organizer_payouts WHERE id=$1 LIMIT 1`,
    [payoutId],
  );
  const payout = rows[0];
  if (!payout) throw new AppError("NOT_FOUND", "Pencairan tidak ditemukan.", {}, 404);
  const report = await loadPayoutReport(payout.event_id, payout.organizer_profile_id);
  return withPayoutReportDocument({
    ...report,
    documentNumber: undefined,
    payoutNumber: payout.payout_number,
    payoutStatus: payout.status,
    payoutAmountRupiah: money(payout.amount),
    bankName: payout.bank_name || report.bankName,
    bankAccountName: payout.bank_account_name || report.bankAccountName,
    bankAccountMasked: maskAccount(payout.bank_account_number) || report.bankAccountMasked,
  });
}

export function payoutReportResponse(report: PayoutReport, formatRaw: string): NextResponse {
  const format = formatRaw.toLowerCase();
  const asCsv = format === "csv" || format === "xlsx" || format === "excel";
  if (asCsv) {
    return new NextResponse(buildPayoutReportCsv(report), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${payoutReportFilename(report, "csv")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  return new NextResponse(Buffer.from(buildPayoutReportPdfBytes(report)), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${payoutReportFilename(report, "pdf")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function payoutReportFilename(report: PayoutReport, ext: "pdf" | "csv"): string {
  const slug = report.eventTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const num = report.payoutNumber || report.eventId.slice(0, 8);
  return `laporan-pencairan-${slug || "event"}-${num}.${ext}`;
}
