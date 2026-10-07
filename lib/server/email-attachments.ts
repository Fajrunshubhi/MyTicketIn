import { query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import type { MailAttachment } from "@/lib/server/mail";
import { getOrder } from "@/lib/server/orders";
import { getTicket, ticketQrPayload } from "@/lib/server/tickets";
import { ticketQrMatrix } from "@/lib/server/qr-png";
import { buildOrderReceiptPdfBytes, type ReceiptOrder } from "@/lib/order-receipt-pdf";
import { buildEventTicketPdfBytes } from "@/lib/ticket-pdf";
import { eventHasEnded } from "@/lib/format";

const MAX_TICKET_ATTACHMENTS = 10;

function methodName(method: string): string {
  if (method === "QRIS") return "QRIS";
  if (method === "EWALLET") return "E-wallet";
  if (method === "VIRTUAL_ACCOUNT") return "Virtual account";
  return method;
}

async function loadBuyer(userId: string): Promise<AuthUser | null> {
  const rows = await query<{ id: string; name: string; username: string; email: string; role: string }>(
    `SELECT id, name, username, email, role FROM users WHERE id=$1 LIMIT 1`,
    [userId],
  );
  const u = rows[0];
  return u ? { ...u, status: "ACTIVE", authVersion: 0 } : null;
}

/** Receipt PDF for a PAID order. Only the buyer of that order may receive it. */
export async function receiptAttachments(orderId: string, recipientUserId: string): Promise<MailAttachment[]> {
  const buyer = await loadBuyer(recipientUserId);
  if (!buyer) return [];
  const order = await getOrder(buyer, orderId);
  if (String(order.status) !== "PAID") return [];
  const pay = await query<{ method: string }>(`SELECT method::text AS method FROM payments WHERE order_id=$1 LIMIT 1`, [orderId]);
  const bytes = buildOrderReceiptPdfBytes(order as unknown as ReceiptOrder, pay[0] ? methodName(pay[0].method) : undefined);
  return [{ filename: `bukti-pembayaran-${String(order.orderNumber)}.pdf`, content: Buffer.from(bytes), contentType: "application/pdf" }];
}

/** One e-ticket PDF per non-cancelled ticket of the buyer's order. The QR is drawn as vector and never logged. */
export async function ticketAttachments(orderId: string, recipientUserId: string): Promise<MailAttachment[]> {
  const buyer = await loadBuyer(recipientUserId);
  if (!buyer) return [];
  const rows = await query<{ id: string }>(
    `SELECT id FROM tickets WHERE order_id=$1 AND owner_user_id=$2 AND status <> 'CANCELLED'::ticket_status ORDER BY unit_sequence, id LIMIT $3`,
    [orderId, recipientUserId, MAX_TICKET_ATTACHMENTS],
  );
  const out: MailAttachment[] = [];
  for (const r of rows) {
    const t = (await getTicket(buyer, r.id)) as unknown as {
      ticketNumber: string;
      manualCode: string;
      status: string;
      event: { title?: string; venueName?: string; city?: string; province?: string; startsAt?: string; endsAt?: string; timezone?: string };
      ticketType: { name?: string; sectionName?: string; seatLabel?: string };
      order: { orderNumber?: string };
      owner: { name?: string };
      holder: { fullName?: string; email?: string; phone?: string; identityNumber?: string };
    };
    const token = await ticketQrPayload(buyer, r.id);
    const bytes = buildEventTicketPdfBytes(
      {
        ticketNumber: t.ticketNumber,
        manualCode: t.manualCode,
        status: t.status,
        eventTitle: t.event?.title || "Event",
        venueLine: [t.event?.venueName, t.event?.city, t.event?.province].filter(Boolean).join(", "),
        startsAt: t.event?.startsAt,
        timezone: t.event?.timezone,
        ticketTypeName: t.ticketType?.name,
        sectionName: t.ticketType?.sectionName,
        seatLabel: t.ticketType?.seatLabel,
        orderNumber: t.order?.orderNumber,
        holderName: t.holder?.fullName || t.owner?.name,
        holderEmail: t.holder?.email,
        holderPhone: t.holder?.phone,
        holderNik: t.holder?.identityNumber,
        eventEnded: eventHasEnded(t.event?.endsAt, t.event?.startsAt),
      },
      null,
      ticketQrMatrix(token),
    );
    out.push({ filename: `tiket-${t.ticketNumber}.pdf`, content: Buffer.from(bytes), contentType: "application/pdf" });
  }
  return out;
}
