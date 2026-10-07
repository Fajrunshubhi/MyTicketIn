import { AppError, newId, query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import { getOrder } from "@/lib/server/orders";
import { issueTicketsForPaidOrder } from "@/lib/server/tickets";
import { eventOwnerUserId, notify } from "@/lib/server/notifications";

export async function createPayment(
  user: AuthUser,
  orderId: string,
  methodRaw: string,
) {
  const order = await getOrder(user, orderId);
  if (order.status !== "PENDING")
    throw new AppError(
      "PAYMENT_ORDER_INVALID",
      "Order tidak dapat dibayar.",
      {},
      409,
    );
  const existing = await query<Record<string, unknown>>(
    `SELECT id, order_id, provider, method, status::text AS status, amount_rupiah, currency, external_reference, created_at::text
     FROM payments WHERE order_id=$1 LIMIT 1`,
    [orderId],
  );
  if (existing[0]) return { payment: payDto(existing[0]), replay: true };
  const method = ["QRIS", "VIRTUAL_ACCOUNT", "EWALLET"].includes(
    String(methodRaw || "").toUpperCase(),
  )
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
  const methodLabel =
    method === "QRIS"
      ? "QRIS"
      : method === "EWALLET"
        ? "e-wallet"
        : "virtual account";
  await notify({
    recipientUserId: user.id,
    type: "PAYMENT_INSTRUCTIONS",
    title: "Kode pembayaran siap",
    body: `Order ${order.orderNumber}: kode ${ref} (${methodLabel}). Bayar sebelum hold 15 menit berakhir. Sandbox, bukan transfer uang nyata.`,
    actionPath: `/dashboard/order/${orderId}`,
    entityType: "Payment",
    entityId: String(rows[0]?.id || id),
    deduplicationKey: `pay-code:${orderId}`,
    domainEventId: `pay-code:${orderId}`,
  });
  return { payment: payDto(rows[0]), replay: false };
}

export async function getPayment(user: AuthUser, orderId: string) {
  await getOrder(user, orderId);
  const rows = await query<Record<string, unknown>>(
    `SELECT id, order_id, provider, method, status::text AS status, amount_rupiah, currency, external_reference, created_at::text
     FROM payments WHERE order_id=$1 LIMIT 1`,
    [orderId],
  );
  if (!rows[0])
    throw new AppError("NOT_FOUND", "Pembayaran tidak ditemukan.", {}, 404);
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
    createdAt: p.created_at
      ? new Date(String(p.created_at)).toISOString()
      : null,
    sandbox: true,
  };
}

/** Returns false when the order is no longer PENDING/in-window (caller decides reconciliation). */
export async function settlePaidOrder(
  orderId: string,
  paymentId: string,
): Promise<boolean> {
  // Conditional update is the single gate: only one caller (webhook, sandbox, retry) wins PENDING -> PAID.
  const marked = await query<{
    id: string;
    buyer_user_id: string;
    event_id: string;
    order_number: string;
    total_payable_rupiah: number;
  }>(
    `UPDATE orders SET status='PAID'::order_status, paid_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$1 AND status='PENDING' AND expires_at > statement_timestamp()
     RETURNING id, buyer_user_id, event_id, order_number, total_payable_rupiah`,
    [orderId],
  );
  const order = marked[0];
  if (!order) return false;
  await query(
    `UPDATE payments SET status='SUCCEEDED'::payment_status, succeeded_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
     WHERE id=$1 AND status IN ('CREATED','PENDING')`,
    [paymentId],
  );
  const res = await query<{ ticket_type_id: string; quantity: number }>(
    `UPDATE inventory_reservations SET released_at=CURRENT_TIMESTAMP, release_reason='CONVERTED_TO_PAID'
     WHERE order_id=$1 AND released_at IS NULL RETURNING ticket_type_id, quantity`,
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
  await applyLoyaltyOnPaid(
    order.id,
    order.buyer_user_id,
    order.event_id,
    Number(order.total_payable_rupiah),
  );
  await issueTicketsForPaidOrder(orderId);
  await notify({
    recipientUserId: order.buyer_user_id,
    type: "PAYMENT_SUCCEEDED",
    title: "Pembayaran berhasil",
    body: `Order ${order.order_number} sudah lunas (sandbox). Tiket diproses ke dompet Anda.`,
    actionPath: `/dashboard/order/${orderId}`,
    entityType: "Order",
    entityId: orderId,
    deduplicationKey: `pay-ok:${orderId}`,
    domainEventId: `pay-ok:${orderId}`,
  });
  const owner = await eventOwnerUserId(order.event_id);
  if (owner) {
    await notify({
      recipientUserId: owner,
      type: "PAYMENT_SUCCEEDED",
      title: "Penjualan tiket baru",
      body: `Ada order lunas untuk event Anda. Cek laporan penjualan (sandbox, bukan uang nyata).`,
      actionPath: "/dashboard/laporan",
      entityType: "Order",
      entityId: orderId,
      deduplicationKey: `sale:${orderId}:${owner}`,
      domainEventId: `pay-ok:${orderId}`,
    });
  }
  return true;
}

/**
 * Converts the points reservation into a ledger debit and grants earned points.
 * Each step is a single atomic statement gated by the reservation state or the ledger unique key,
 * so replays never duplicate debit or earn.
 */
export async function applyLoyaltyOnPaid(
  orderId: string,
  buyerId: string,
  eventId: string,
  totalPayable: number,
): Promise<void> {
  await query(
    `WITH cons AS (
       UPDATE loyalty_point_reservations
       SET status='CONSUMED'::loyalty_reservation_status, consumed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1
       WHERE order_id=$1 AND status='ACTIVE'
       RETURNING account_id, points
     ), ins AS (
       INSERT INTO loyalty_ledger_entries (id, account_id, entry_type, points_delta, source_key, order_id,
                                           balance_points_after, debt_points_after, actor_type, correlation_id)
       SELECT $2, a.id, 'REDEEM_DEBIT'::loyalty_entry_type, -cons.points, $3, $1,
              a.balance_points - cons.points, a.debt_points, 'SYSTEM', $4
       FROM cons JOIN loyalty_accounts a ON a.id = cons.account_id
       ON CONFLICT (account_id, source_key, entry_type) DO NOTHING
       RETURNING account_id, points_delta
     )
     UPDATE loyalty_accounts a
     SET balance_points = a.balance_points + ins.points_delta,
         reserved_points = a.reserved_points + ins.points_delta,
         updated_at=CURRENT_TIMESTAMP, version=a.version+1
     FROM ins WHERE a.id = ins.account_id`,
    [orderId, newId(), `order:${orderId}:redeem`, `paid:${orderId}`],
  );
  const earned = Math.floor(totalPayable / 1000);
  if (earned <= 0) return;
  await query(
    `INSERT INTO loyalty_accounts (id, buyer_user_id, organizer_profile_id)
     SELECT $1, $2, e.organizer_profile_id FROM events e WHERE e.id=$3
     ON CONFLICT (buyer_user_id, organizer_profile_id) DO NOTHING`,
    [newId(), buyerId, eventId],
  );
  const acc = await query<{ id: string }>(
    `SELECT a.id FROM loyalty_accounts a JOIN events e ON e.organizer_profile_id=a.organizer_profile_id
     WHERE a.buyer_user_id=$1 AND e.id=$2 LIMIT 1`,
    [buyerId, eventId],
  );
  if (!acc[0]) return;
  const granted = await query<{ account_id: string }>(
    `WITH ins AS (
       INSERT INTO loyalty_ledger_entries (id, account_id, entry_type, points_delta, source_key, order_id,
                                           balance_points_after, debt_points_after, actor_type, correlation_id)
       SELECT $2, a.id, 'EARN'::loyalty_entry_type, $3::bigint, $4, $5,
              a.balance_points + $3::bigint, a.debt_points, 'SYSTEM', $6
       FROM loyalty_accounts a WHERE a.id=$1
       ON CONFLICT (account_id, source_key, entry_type) DO NOTHING
       RETURNING account_id, points_delta
     ), upd AS (
       UPDATE loyalty_accounts a SET balance_points = a.balance_points + ins.points_delta,
              updated_at=CURRENT_TIMESTAMP, version=a.version+1
       FROM ins WHERE a.id = ins.account_id
       RETURNING a.id
     )
     SELECT account_id FROM ins`,
    [
      acc[0].id,
      newId(),
      earned,
      `order:${orderId}:earn`,
      orderId,
      `paid:${orderId}`,
    ],
  );
  if (granted[0]) {
    await query(`UPDATE orders SET loyalty_earned_points=$2 WHERE id=$1`, [
      orderId,
      earned,
    ]);
  }
}

export async function sandboxSettle(user: AuthUser, orderId: string) {
  const pay = await getPayment(user, orderId);
  const ok = await settlePaidOrder(orderId, String(pay.id));
  if (!ok)
    throw new AppError(
      "ORDER_CONFLICT",
      "Order tidak dapat diselesaikan.",
      {},
      409,
    );
  return { status: "PAID" };
}
