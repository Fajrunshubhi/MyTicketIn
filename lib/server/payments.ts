import { AppError, newId, query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import { getOrder } from "@/lib/server/orders";
import { issueTicketsForPaidOrder } from "@/lib/server/tickets";

export async function createPayment(user: AuthUser, orderId: string, methodRaw: string) {
  const order = await getOrder(user, orderId);
  if (order.status !== "PENDING") throw new AppError("PAYMENT_ORDER_INVALID", "Order tidak dapat dibayar.", {}, 409);
  const existing = await query<Record<string, unknown>>(
    `SELECT id, order_id, provider, method, status::text AS status, amount_rupiah, currency, external_reference, created_at::text
     FROM payments WHERE order_id=$1 LIMIT 1`,
    [orderId],
  );
  if (existing[0]) return { payment: payDto(existing[0]), replay: true };
  const method = ["QRIS", "VIRTUAL_ACCOUNT", "EWALLET"].includes(String(methodRaw || "").toUpperCase())
    ? String(methodRaw).toUpperCase()
    : "VIRTUAL_ACCOUNT";
  const id = newId();
  const ref = `sandbox-${id.slice(0, 16)}`;
  const rows = await query<Record<string, unknown>>(
    `INSERT INTO payments (id, order_id, provider, environment, method, status, amount_rupiah, currency, external_reference, provider_idempotency_key)
     VALUES ($1,$2,'sandbox','SANDBOX',$3::payment_method,'CREATED'::payment_status,$4,'IDR',$5,$6)
     RETURNING id, order_id, provider, method::text AS method, status::text AS status, amount_rupiah, currency, external_reference, created_at::text`,
    [id, orderId, method, order.totalPayableRupiah, ref, `pay-${id}`],
  );
  return { payment: payDto(rows[0]), replay: false };
}

export async function getPayment(user: AuthUser, orderId: string) {
  await getOrder(user, orderId);
  const rows = await query<Record<string, unknown>>(
    `SELECT id, order_id, provider, method, status::text AS status, amount_rupiah, currency, external_reference, created_at::text
     FROM payments WHERE order_id=$1 LIMIT 1`,
    [orderId],
  );
  if (!rows[0]) throw new AppError("NOT_FOUND", "Pembayaran tidak ditemukan.", {}, 404);
  return payDto(rows[0]);
}

function payDto(p: Record<string, unknown>) {
  return {
    id: p.id,
    orderId: p.order_id,
    provider: p.provider,
    method: p.method,
    status: p.status,
    amountRupiah: Number(p.amount_rupiah),
    currency: p.currency,
    externalReference: p.external_reference,
    createdAt: p.created_at ? new Date(String(p.created_at)).toISOString() : null,
    sandbox: true,
  };
}

export async function sandboxSettle(user: AuthUser, orderId: string) {
  const pay = await getPayment(user, orderId);
  const marked = await query<{ id: string }>(
    `UPDATE orders SET status='PAID'::order_status, paid_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$1 AND status='PENDING' AND expires_at > statement_timestamp()
     RETURNING id`,
    [orderId],
  );
  if (!marked[0]) throw new AppError("ORDER_CONFLICT", "Order tidak dapat diselesaikan.", {}, 409);
  await query(
    `UPDATE payments SET status='SUCCEEDED'::payment_status, succeeded_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
    [pay.id],
  );
  const res = await query<{ ticket_type_id: string; quantity: number }>(
    `SELECT ticket_type_id, quantity FROM inventory_reservations WHERE order_id=$1 AND released_at IS NULL`,
    [orderId],
  );
  for (const r of res) {
    await query(
      `UPDATE event_ticket_types SET reserved_quantity = reserved_quantity - $2, paid_quantity = paid_quantity + $2,
              updated_at=CURRENT_TIMESTAMP, version=version+1
       WHERE id=$1 AND reserved_quantity >= $2`,
      [r.ticket_type_id, r.quantity],
    );
  }
  await query(
    `UPDATE inventory_reservations SET released_at=CURRENT_TIMESTAMP, release_reason='CONVERTED_TO_PAID' WHERE order_id=$1 AND released_at IS NULL`,
    [orderId],
  );
  await issueTicketsForPaidOrder(orderId, user);
  return { status: "PAID" };
}
