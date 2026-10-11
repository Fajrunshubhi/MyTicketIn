import { AppError, execute, newId, query } from "@/lib/server/http";
import { notify } from "@/lib/server/notifications";
import { readGalleryFile, saveGalleryFile } from "@/lib/server/gallery";

/**
 * Organizer payouts (sandbox). Buyer payments land on the platform's single payment-provider account;
 * after an event has ended and the hold passed, its net (paid orders minus completed refunds) is forwarded
 * to the organizer's registered bank account. Net is always recomputed from orders/refunds, never stored as a balance.
 */
const DEFAULT_HOLD_HOURS = 24;

export function payoutHoldHours(): number {
  const raw = process.env.PAYOUT_HOLD_HOURS;
  if (raw === undefined || raw === "") return DEFAULT_HOLD_HOURS;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 24 * 30 ? n : DEFAULT_HOLD_HOURS;
}

export type PayoutBlock =
  | "NOT_ENDED"
  | "HOLD"
  | "OPEN_REFUND"
  | "NO_BANK"
  | "NOT_PUBLISHED"
  | "ALREADY_REQUESTED"
  | "ALREADY_PAID"
  | "NOTHING_TO_PAY";

type PayoutRow = {
  id: string;
  payout_number: string;
  organizer_profile_id: string;
  event_id: string;
  amount_rupiah: string;
  status: string;
  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
  requested_at: string;
  decided_at: string | null;
  decision_reason: string | null;
  transfer_proof_name: string | null;
  paid_at: string | null;
  event_title?: string;
  organizer_name?: string;
};

const PAYOUT_COLS = `p.id, p.payout_number, p.organizer_profile_id, p.event_id, p.amount_rupiah::text, p.status,
  p.bank_name, p.bank_account_name, p.bank_account_number, p.requested_at::text, p.decided_at::text,
  p.decision_reason, p.transfer_proof_name, p.paid_at::text`;

function maskAccount(v: string): string {
  const d = String(v || "").replace(/\D/g, "");
  return d.length < 4 ? "****" : `${"*".repeat(Math.max(4, d.length - 4))}${d.slice(-4)}`;
}

/** Admin sees the full account number to transfer; organizers only see it masked. */
function payoutDto(r: PayoutRow, full: boolean) {
  return {
    id: r.id,
    payoutNumber: r.payout_number,
    organizerProfileId: r.organizer_profile_id,
    organizerName: r.organizer_name || undefined,
    eventId: r.event_id,
    eventTitle: r.event_title || undefined,
    amountRupiah: Number(r.amount_rupiah),
    status: r.status,
    bankName: r.bank_name,
    accountName: r.bank_account_name,
    accountNumber: full ? r.bank_account_number : maskAccount(r.bank_account_number),
    requestedAt: r.requested_at ? new Date(r.requested_at).toISOString() : null,
    decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
    decisionReason: r.decision_reason,
    paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
    hasTransferProof: Boolean(r.transfer_proof_name),
    sandbox: true,
  };
}

export function payoutBlockReason(input: {
  eventStatus: string;
  pastEnd: boolean;
  pastHold: boolean;
  netRupiah: number;
  openRefunds: number;
  hasBank: boolean;
  payoutStatus: string | null;
}): PayoutBlock | null {
  if (input.payoutStatus === "PAID") return "ALREADY_PAID";
  if (input.payoutStatus === "REQUESTED") return "ALREADY_REQUESTED";
  if (!["PUBLISHED", "COMPLETED"].includes(input.eventStatus)) return "NOT_PUBLISHED";
  if (!input.pastEnd) return "NOT_ENDED";
  if (!input.pastHold) return "HOLD";
  if (input.openRefunds > 0) return "OPEN_REFUND";
  if (!input.hasBank) return "NO_BANK";
  if (input.netRupiah <= 0) return "NOTHING_TO_PAY";
  return null;
}

export async function organizerPayoutOverview(organizerProfileId: string) {
  const hold = payoutHoldHours();
  const bank = await query<{ bank_account_number: string | null }>(
    `SELECT bank_account_number FROM organizer_profiles WHERE id=$1 LIMIT 1`,
    [organizerProfileId],
  );
  const hasBank = Boolean(bank[0]?.bank_account_number);
  const rows = await query<{
    id: string;
    title: string;
    status: string;
    ends_at: string;
    gross: string;
    refunded: string;
    open_refunds: string;
    past_end: boolean;
    past_hold: boolean;
    payout_id: string | null;
    payout_number: string | null;
    payout_status: string | null;
    payout_amount: string | null;
  }>(
    `SELECT e.id, e.title, e.status::text AS status, e.ends_at::text AS ends_at,
            g.gross::text AS gross, COALESCE(r.refunded,0)::text AS refunded, COALESCE(r.open_n,0)::text AS open_refunds,
            (e.ends_at <= CURRENT_TIMESTAMP) AS past_end,
            (e.ends_at + make_interval(hours => $2::int) <= CURRENT_TIMESTAMP) AS past_hold,
            p.id AS payout_id, p.payout_number, p.status AS payout_status, p.amount_rupiah::text AS payout_amount
     FROM events e
     JOIN LATERAL (
       SELECT SUM(o.total_payable_rupiah) AS gross FROM orders o
       WHERE o.event_id = e.id AND o.status IN ('PAID'::order_status, 'REFUNDED'::order_status)
     ) g ON g.gross > 0
     LEFT JOIN LATERAL (
       SELECT SUM(CASE WHEN rf.status = 'COMPLETED'::refund_status THEN rf.amount_rupiah ELSE 0 END) AS refunded,
              COUNT(*) FILTER (WHERE rf.status IN ('REQUESTED'::refund_status,'APPROVED'::refund_status,'PROCESSING'::refund_status)) AS open_n
       FROM refunds rf JOIN orders o ON o.id = rf.order_id WHERE o.event_id = e.id
     ) r ON true
     LEFT JOIN LATERAL (
       SELECT id, payout_number, status, amount_rupiah FROM organizer_payouts op
       WHERE op.event_id = e.id ORDER BY (op.status <> 'REJECTED') DESC, op.requested_at DESC LIMIT 1
     ) p ON true
     WHERE e.organizer_profile_id = $1
     ORDER BY e.ends_at DESC LIMIT 100`,
    [organizerProfileId, hold],
  );
  const events = rows.map((r) => {
    const net = Number(r.gross) - Number(r.refunded);
    return {
      eventId: r.id,
      title: r.title,
      eventStatus: r.status,
      endsAt: new Date(r.ends_at).toISOString(),
      grossRupiah: Number(r.gross),
      refundedRupiah: Number(r.refunded),
      netRupiah: net,
      openRefunds: Number(r.open_refunds),
      payout: r.payout_id
        ? { id: r.payout_id, payoutNumber: r.payout_number, status: r.payout_status, amountRupiah: Number(r.payout_amount) }
        : null,
      blockedBy: payoutBlockReason({
        eventStatus: r.status,
        pastEnd: r.past_end,
        pastHold: r.past_hold,
        netRupiah: net,
        openRefunds: Number(r.open_refunds),
        hasBank,
        payoutStatus: r.payout_status === "REJECTED" ? null : r.payout_status,
      }),
    };
  });
  const totals = events.reduce(
    (a, e) => {
      if (e.payout?.status === "PAID") a.paid += e.payout.amountRupiah;
      else if (e.payout?.status === "REQUESTED") a.requested += e.payout.amountRupiah;
      else if (e.blockedBy === null) a.available += e.netRupiah;
      else if (e.netRupiah > 0 && e.eventStatus !== "CANCELLED") a.pending += e.netRupiah;
      return a;
    },
    { available: 0, requested: 0, paid: 0, pending: 0 },
  );
  return { events, totals, holdHours: hold, hasBank, sandbox: true };
}

export async function requestPayout(userId: string, organizerProfileId: string, eventId: string) {
  const id = newId();
  const payoutNumber = `PYT-${id.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  // One statement: eligibility, amount and insert cannot be split by a concurrent refund or second request.
  const rows = await query<PayoutRow>(
    `WITH calc AS (
       SELECT e.id AS event_id, e.organizer_profile_id,
         COALESCE((SELECT SUM(o.total_payable_rupiah) FROM orders o
                   WHERE o.event_id = e.id AND o.status IN ('PAID'::order_status,'REFUNDED'::order_status)), 0)
         - COALESCE((SELECT SUM(rf.amount_rupiah) FROM refunds rf JOIN orders o ON o.id = rf.order_id
                     WHERE o.event_id = e.id AND rf.status = 'COMPLETED'::refund_status), 0) AS net,
         (SELECT COUNT(*) FROM refunds rf JOIN orders o ON o.id = rf.order_id
          WHERE o.event_id = e.id AND rf.status IN ('REQUESTED'::refund_status,'APPROVED'::refund_status,'PROCESSING'::refund_status)) AS open_refunds
       FROM events e
       WHERE e.id = $3 AND e.organizer_profile_id = $2 AND e.status IN ('PUBLISHED'::event_status,'COMPLETED'::event_status)
         AND e.ends_at + make_interval(hours => $5::int) <= CURRENT_TIMESTAMP
     )
     INSERT INTO organizer_payouts (id, payout_number, organizer_profile_id, event_id, amount_rupiah,
                                    bank_name, bank_account_name, bank_account_number, requested_by_user_id)
     SELECT $1, $6, c.organizer_profile_id, c.event_id, c.net, p.bank_name, p.bank_account_name, p.bank_account_number, $4
     FROM calc c JOIN organizer_profiles p ON p.id = c.organizer_profile_id
     WHERE c.net > 0 AND c.open_refunds = 0 AND p.status = 'APPROVED'::organizer_status
       AND p.bank_name IS NOT NULL AND p.bank_account_name IS NOT NULL AND p.bank_account_number IS NOT NULL
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [id, organizerProfileId, eventId, userId, payoutHoldHours(), payoutNumber],
  );
  if (!rows[0]) {
    const overview = await organizerPayoutOverview(organizerProfileId);
    const ev = overview.events.find((e) => e.eventId === eventId);
    if (!ev) throw new AppError("NOT_FOUND", "Event tidak ditemukan.", {}, 404);
    throw new AppError(
      "PAYOUT_NOT_ALLOWED",
      blockMessage(ev.blockedBy),
      {},
      409,
    );
  }
  const created = await loadPayout(id);
  const admins = await query<{ id: string }>(`SELECT id FROM users WHERE role='ADMIN'::user_role AND status='ACTIVE'::user_status LIMIT 20`);
  for (const a of admins) {
    await notify({
      recipientUserId: a.id,
      type: "PAYOUT_UPDATED",
      title: "Pengajuan pencairan baru",
      body: `${created.payout_number}: Rp${Number(created.amount_rupiah).toLocaleString("id-ID")} untuk ${created.event_title}. Sandbox.`,
      actionPath: "/admin/payouts",
      entityType: "Payout",
      entityId: id,
      deduplicationKey: `payout-req:${id}:${a.id}`,
      domainEventId: `payout:${id}:requested`,
    });
  }
  return payoutDto(created, false);
}

export function blockMessage(block: PayoutBlock | null): string {
  switch (block) {
    case "NOT_ENDED":
      return "Pencairan dibuka setelah event selesai.";
    case "HOLD":
      return `Dana ditahan ${payoutHoldHours()} jam setelah event selesai untuk membuka masa refund.`;
    case "OPEN_REFUND":
      return "Masih ada refund yang belum selesai untuk event ini.";
    case "NO_BANK":
      return "Lengkapi rekening penyelenggara di profil terlebih dahulu.";
    case "NOT_PUBLISHED":
      return "Event ini tidak dapat dicairkan.";
    case "ALREADY_REQUESTED":
      return "Pencairan event ini sudah diajukan.";
    case "ALREADY_PAID":
      return "Dana event ini sudah dicairkan.";
    default:
      return "Tidak ada dana yang dapat dicairkan.";
  }
}

async function loadPayout(id: string): Promise<PayoutRow> {
  const rows = await query<PayoutRow>(
    `SELECT ${PAYOUT_COLS}, e.title AS event_title, op.name AS organizer_name
     FROM organizer_payouts p JOIN events e ON e.id = p.event_id JOIN organizer_profiles op ON op.id = p.organizer_profile_id
     WHERE p.id = $1 LIMIT 1`,
    [id],
  );
  if (!rows[0]) throw new AppError("NOT_FOUND", "Pencairan tidak ditemukan.", {}, 404);
  return rows[0];
}

export async function listOrganizerPayouts(organizerProfileId: string, limit = 50) {
  const rows = await query<PayoutRow>(
    `SELECT ${PAYOUT_COLS}, e.title AS event_title
     FROM organizer_payouts p JOIN events e ON e.id = p.event_id
     WHERE p.organizer_profile_id = $1 ORDER BY p.requested_at DESC LIMIT $2`,
    [organizerProfileId, Math.min(Math.max(limit, 1), 100)],
  );
  return rows.map((r) => payoutDto(r, false));
}

export async function listAdminPayouts(status: string, limit = 80) {
  const wanted = ["REQUESTED", "PAID", "REJECTED"].includes(status) ? status : null;
  const rows = await query<PayoutRow>(
    `SELECT ${PAYOUT_COLS}, e.title AS event_title, op.name AS organizer_name
     FROM organizer_payouts p JOIN events e ON e.id = p.event_id JOIN organizer_profiles op ON op.id = p.organizer_profile_id
     WHERE ($1::text IS NULL OR p.status = $1)
     ORDER BY p.requested_at DESC LIMIT $2`,
    [wanted, Math.min(Math.max(limit, 1), 200)],
  );
  return rows.map((r) => payoutDto(r, true));
}

async function notifyOrganizer(row: PayoutRow, title: string, body: string) {
  const owner = await query<{ owner_user_id: string }>(
    `SELECT owner_user_id FROM organizer_profiles WHERE id=$1 LIMIT 1`,
    [row.organizer_profile_id],
  );
  if (!owner[0]) return;
  await notify({
    recipientUserId: owner[0].owner_user_id,
    type: "PAYOUT_UPDATED",
    title,
    body,
    actionPath: "/dashboard/payouts",
    entityType: "Payout",
    entityId: row.id,
    deduplicationKey: `payout-org:${row.id}:${row.status}`,
    domainEventId: `payout:${row.id}:${row.status}`,
  });
}

async function auditPayout(adminId: string, action: string, payoutId: string, meta: Record<string, unknown>) {
  await execute(
    `INSERT INTO audit_logs (id, actor_type, actor_user_id, action, entity_type, entity_id, outcome, correlation_id, metadata)
     VALUES ($1,'USER',$2,$3,'OrganizerPayout',$4,'SUCCESS',$5,$6::jsonb)`,
    [newId(), adminId, action, payoutId, `payout:${payoutId}`, JSON.stringify(meta)],
  );
}

/** Admin records the transfer with its proof; the conditional update guarantees a payout is paid at most once. */
export async function markPayoutPaid(adminId: string, payoutId: string, proof: Buffer) {
  const current = await loadPayout(payoutId);
  if (current.status !== "REQUESTED") {
    throw new AppError("PAYOUT_NOT_ALLOWED", "Pencairan ini sudah diproses.", {}, 409);
  }
  const url = await saveGalleryFile(proof);
  const name = url.replace(/^.*\//, "");
  const updated = await query<{ id: string }>(
    `UPDATE organizer_payouts SET status='PAID', decided_by_user_id=$2, decided_at=CURRENT_TIMESTAMP,
            paid_at=CURRENT_TIMESTAMP, transfer_proof_name=$3
     WHERE id=$1 AND status='REQUESTED' RETURNING id`,
    [payoutId, adminId, name],
  );
  if (!updated[0]) throw new AppError("PAYOUT_NOT_ALLOWED", "Pencairan ini sudah diproses.", {}, 409);
  const done = await loadPayout(payoutId);
  await auditPayout(adminId, "payout.paid", payoutId, { amountRupiah: Number(done.amount_rupiah) });
  await notifyOrganizer(
    done,
    "Dana event dicairkan",
    `${done.payout_number}: Rp${Number(done.amount_rupiah).toLocaleString("id-ID")} ditransfer ke ${done.bank_name} (sandbox, bukan uang nyata). Bukti transfer tersedia.`,
  );
  return payoutDto(done, true);
}

export async function rejectPayout(adminId: string, payoutId: string, reasonRaw: string) {
  const reason = String(reasonRaw || "").trim();
  if (reason.length < 10 || reason.length > 1000) {
    throw new AppError("VALIDATION_ERROR", "Alasan penolakan 10–1000 karakter.", { reason: "Alasan wajib minimal 10 karakter." }, 400);
  }
  const updated = await query<{ id: string }>(
    `UPDATE organizer_payouts SET status='REJECTED', decided_by_user_id=$2, decided_at=CURRENT_TIMESTAMP, decision_reason=$3
     WHERE id=$1 AND status='REQUESTED' RETURNING id`,
    [payoutId, adminId, reason],
  );
  if (!updated[0]) {
    await loadPayout(payoutId);
    throw new AppError("PAYOUT_NOT_ALLOWED", "Pencairan ini sudah diproses.", {}, 409);
  }
  const done = await loadPayout(payoutId);
  await auditPayout(adminId, "payout.rejected", payoutId, {});
  await notifyOrganizer(done, "Pencairan ditolak", `${done.payout_number}: ${reason} Anda dapat mengajukan ulang setelah memperbaikinya.`);
  return payoutDto(done, true);
}

export async function readPayoutProof(userId: string, role: string, payoutId: string) {
  const row = await loadPayout(payoutId);
  if (role !== "ADMIN") {
    const org = await query<{ id: string }>(`SELECT id FROM organizer_profiles WHERE owner_user_id=$1 LIMIT 1`, [userId]);
    if (org[0]?.id !== row.organizer_profile_id) throw new AppError("NOT_FOUND", "Pencairan tidak ditemukan.", {}, 404);
  }
  if (!row.transfer_proof_name) throw new AppError("NOT_FOUND", "Bukti transfer belum tersedia.", {}, 404);
  const file = await readGalleryFile(row.transfer_proof_name);
  if (!file) throw new AppError("NOT_FOUND", "Bukti transfer belum tersedia.", {}, 404);
  return file;
}

/** Refunds must not be created once an event's money has been requested or forwarded. */
export async function assertNoLivePayoutForOrder(orderId: string): Promise<void> {
  const rows = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM organizer_payouts p JOIN orders o ON o.event_id = p.event_id
     WHERE o.id = $1 AND p.status IN ('REQUESTED','PAID')`,
    [orderId],
  );
  if (Number(rows[0]?.n || 0) > 0) {
    throw new AppError("REFUND_NOT_ALLOWED", "Dana event ini sudah diajukan untuk dicairkan; refund baru tidak dapat dibuat.", {}, 409);
  }
}
