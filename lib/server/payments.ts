import { AppError, newId, query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import { getOrder } from "@/lib/server/orders";
import { issueTicketsForPaidOrder } from "@/lib/server/tickets";
import { eventOwnerUserId, notify } from "@/lib/server/notifications";
import {
  activePaymentProvider,
  createQrisCharge,
  createSnapTransaction,
  createVaCharge,
  midtransMode,
  requireMidtransKey,
} from "@/lib/server/midtrans";
import { publicAppOrigin } from "@/lib/server/mail";
import { refreshMidtransPayment } from "@/lib/server/payment-webhook";
import {
  parsePaymentMethod,
  parseVaBank,
  sandboxEwalletInstructions,
  sandboxQrisInstructions,
  sandboxVaInstructions,
  sanitizePaymentInstructions,
  midtransSimulatorUrl,
  type PaymentInstructions,
  type VaBank,
} from "@/lib/payment-methods";

export async function createPayment(
  user: AuthUser,
  orderId: string,
  methodRaw: string,
  opts: { bank?: string } = {},
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
    `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE order_id=$1 LIMIT 1`,
    [orderId],
  );
  if (existing[0]) {
    const row = existing[0];
    const replayBank = parseVaBank(opts.bank) || parseVaBank(String((row.instruction_data as { bank?: string } | null)?.bank || ""));
    // A previous attempt may have stored the row but failed to reach the provider: finish it instead of duplicating.
    if (row.status === "CREATED" && !sanitizePaymentInstructions(row.instruction_data) && !snapRedirectUrl(row)) {
      const fresh = await attachProviderInstructions(user, order, row, replayBank);
      return { payment: payDto(fresh), replay: true };
    }
    return { payment: payDto(row), replay: true };
  }
  const method = parsePaymentMethod(methodRaw);
  if (!method) {
    throw new AppError("VALIDATION_ERROR", "Metode pembayaran tidak valid.", { method: "Pilih QRIS atau virtual account." }, 400);
  }
  const bank = method === "VIRTUAL_ACCOUNT" ? parseVaBank(opts.bank) : null;
  if (method === "VIRTUAL_ACCOUNT" && !bank) {
    throw new AppError("VALIDATION_ERROR", "Pilih bank virtual account.", { bank: "Pilih bank tujuan." }, 400);
  }
  const provider = activePaymentProvider();
  const live = provider === "midtrans" && midtransMode() === "production";
  if (provider === "midtrans") {
    requireMidtransKey();
    if (live && !publicAppOrigin().startsWith("https://")) {
      throw new AppError(
        "SERVICE_UNHEALTHY",
        "Pembayaran nyata membutuhkan WEB_ORIGIN https publik agar Midtrans dapat mengirim notifikasi.",
        {},
        503,
      );
    }
  }
  const environment = live ? "PRODUCTION" : "SANDBOX";
  const id = newId();
  // Midtrans order_id is capped at 50 characters.
  const ref = provider === "midtrans" ? `mti-${id.slice(0, 24)}` : `sandbox-${id.slice(0, 16)}`;
  let rows = await query<Record<string, unknown>>(
    `INSERT INTO payments (id, order_id, provider, environment, method, status, amount_rupiah, currency, external_reference, provider_idempotency_key)
     VALUES ($1,$2,$7,$8,$3::payment_method,'CREATED'::payment_status,$4,'IDR',$5,$6)
     ON CONFLICT (order_id) DO NOTHING
     RETURNING ${PAYMENT_COLUMNS}`,
    [id, orderId, method, order.totalPayableRupiah, ref, `pay-${id}`, provider, environment],
  );
  if (!rows[0]) {
    const again = await query<Record<string, unknown>>(
      `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE order_id=$1 LIMIT 1`,
      [orderId],
    );
    return { payment: payDto(again[0]), replay: true };
  }
  rows = [await attachProviderInstructions(user, order, rows[0], bank)];
  const label = method === "QRIS" ? "QRIS" : method === "EWALLET" ? "e-wallet" : `virtual account${bank ? ` ${bank}` : ""}`;
  await notify({
    recipientUserId: user.id,
    type: "PAYMENT_INSTRUCTIONS",
    title: "Selesaikan pembayaran",
    body: `Order ${order.orderNumber}: instruksi ${label} siap. Bayar sebelum hold 15 menit berakhir.`,
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
    `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE order_id=$1 LIMIT 1`,
    [orderId],
  );
  if (!rows[0])
    throw new AppError("NOT_FOUND", "Pembayaran tidak ditemukan.", {}, 404);
  return payDto(rows[0]);
}

/**
 * Pulls the authoritative Midtrans status and applies it through the same idempotent pipeline as the webhook,
 * so a lost notification never leaves a paid order pending. Non-Midtrans payments are returned unchanged.
 */
export async function refreshPayment(user: AuthUser, orderId: string) {
  const current = await getPayment(user, orderId);
  if (current.provider !== "midtrans" || !["CREATED", "PENDING"].includes(String(current.status))) {
    return current;
  }
  try {
    await refreshMidtransPayment(String(current.externalReference));
  } catch (err) {
    // The webhook may have recorded the same event with a differently shaped body; the state is already applied.
    if (!(err instanceof AppError && err.code === "WEBHOOK_PAYLOAD_MISMATCH")) throw err;
  }
  return getPayment(user, orderId);
}

const PAYMENT_COLUMNS = `id, order_id, provider, environment, method::text AS method, status::text AS status, amount_rupiah, currency,
  external_reference, created_at::text, provider_expires_at::text, instruction_data, provider_idempotency_key`;

function snapRedirectUrl(p: Record<string, unknown>): string {
  const data = p.instruction_data;
  const url = data && typeof data === "object" ? (data as Record<string, unknown>).redirectUrl : "";
  return typeof url === "string" ? url : "";
}

async function persistInstructions(
  row: Record<string, unknown>,
  instructions: PaymentInstructions,
  expiresAt: string,
): Promise<Record<string, unknown>> {
  const updated = await query<Record<string, unknown>>(
    `UPDATE payments SET instruction_data=$2::jsonb, status='PENDING'::payment_status,
            provider_expires_at=$3::timestamptz, updated_at=CURRENT_TIMESTAMP
     WHERE id=$1 AND status IN ('CREATED','PENDING')
     RETURNING ${PAYMENT_COLUMNS}`,
    [row.id, JSON.stringify(instructions), expiresAt],
  );
  return updated[0] || row;
}

/** Creates provider instructions for an already stored payment row; retry-safe because the order_id/reference is stable. */
async function attachProviderInstructions(
  user: AuthUser,
  order: Awaited<ReturnType<typeof getOrder>>,
  row: Record<string, unknown>,
  bank: VaBank | null,
): Promise<Record<string, unknown>> {
  const expiresAt = order.expiresAt || "";
  const minutes = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60000);
  if (!(minutes >= 1)) throw new AppError("PAYMENT_ORDER_INVALID", "Order tidak dapat dibayar.", {}, 409);
  const method = String(row.method);
  const amount = Number(row.amount_rupiah);
  const ref = String(row.external_reference);
  const provider = String(row.provider);

  if (provider !== "midtrans") {
    const instructions =
      method === "QRIS"
        ? sandboxQrisInstructions(ref, amount)
        : method === "VIRTUAL_ACCOUNT"
          ? sandboxVaInstructions(bank || "BCA", String(row.id), amount)
          : sandboxEwalletInstructions(ref);
    return persistInstructions(row, instructions, expiresAt);
  }

  const buyerName = user.name || user.username || "Pembeli";
  const buyerEmail = user.email || "";
  const phoneRows = await query<{ phone: string | null }>(`SELECT phone FROM users WHERE id=$1 LIMIT 1`, [user.id]);
  const buyerPhone = phoneRows[0]?.phone || undefined;
  const chargeItems = (order.items || []).map((it) => ({
    id: String(it.ticketTypeId || it.id),
    name: String(it.name || "Tiket"),
    price: Number(it.unitPriceRupiah || 0),
    quantity: Number(it.quantity || 0),
  }));
  if (method === "QRIS") {
    const instructions = await createQrisCharge({
      orderId: ref,
      amountRupiah: amount,
      expiresInMinutes: minutes,
      idempotencyKey: String(row.provider_idempotency_key || row.id),
      customerName: buyerName,
      customerEmail: buyerEmail,
      customerPhone: buyerPhone,
      items: chargeItems,
    });
    return persistInstructions(row, instructions, expiresAt);
  }
  if (method === "VIRTUAL_ACCOUNT") {
    const instructions = await createVaCharge({
      orderId: ref,
      amountRupiah: amount,
      expiresInMinutes: minutes,
      bank: bank || "BCA",
      idempotencyKey: String(row.provider_idempotency_key || row.id),
      customerName: buyerName,
      customerEmail: buyerEmail,
      customerPhone: buyerPhone,
      items: chargeItems,
    });
    return persistInstructions(row, instructions, expiresAt);
  }
  const snap = await createSnapTransaction({
    orderId: ref,
    amountRupiah: amount,
    expiresInMinutes: minutes,
    customerName: user.name || user.username || "Pembeli",
    customerEmail: user.email || "",
    customerPhone: buyerPhone,
    finishUrl: `${publicAppOrigin()}/dashboard/order/${String(row.order_id)}`,
    enabledPayments: midtransMode() === "production" ? ["gopay", "shopeepay"] : ["shopeepay"],
  });
  return persistInstructions(
    row,
    {
      kind: "EWALLET",
      redirectUrl: snap.redirectUrl,
      copyText: "",
      ...(midtransMode() === "production"
        ? { simulatorHint: "Selesaikan pembayaran di halaman Midtrans, lalu kembali ke sini dan tekan Cek status." }
        : {
            simulatorHint:
              "Klik Lanjut di Midtrans, pilih ShopeePay, selesaikan di halaman simulator. Jangan tekan Back sebelum berhasil.",
          }),
    },
    expiresAt,
  );
}

function payDto(p: Record<string, unknown>) {
  const instructions = sanitizePaymentInstructions(p.instruction_data);
  const redirectUrl =
    instructions?.redirectUrl ||
    (snapRedirectUrl(p) && ["CREATED", "PENDING"].includes(String(p.status)) ? snapRedirectUrl(p) : "");
  return {
    redirectUrl: redirectUrl && ["CREATED", "PENDING"].includes(String(p.status)) ? redirectUrl : null,
    instructions,
    providerExpiresAt: p.provider_expires_at ? new Date(String(p.provider_expires_at)).toISOString() : null,
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
    sandbox: String(p.environment || "SANDBOX") !== "PRODUCTION",
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
  await finalizePaidOrder(order);
  return true;
}

type PaidOrderRow = {
  id: string;
  buyer_user_id: string;
  event_id: string;
  order_number: string;
  total_payable_rupiah: number;
};

/**
 * Everything that must follow PENDING -> PAID. Each step is idempotent, so it is safe to call again
 * after a crash between the status gate and the later steps (webhook retry or recovery job).
 */
export async function finalizePaidOrder(order: PaidOrderRow): Promise<void> {
  const orderId = order.id;
  // One statement: releasing the reservation and moving counters cannot be split by a crash.
  await query(
    `WITH rel AS (
       UPDATE inventory_reservations SET released_at=CURRENT_TIMESTAMP, release_reason='CONVERTED_TO_PAID'
       WHERE order_id=$1 AND released_at IS NULL RETURNING ticket_type_id, quantity
     ), agg AS (
       SELECT ticket_type_id, SUM(quantity)::int AS qty FROM rel GROUP BY ticket_type_id
     )
     UPDATE event_ticket_types t
     SET reserved_quantity = t.reserved_quantity - agg.qty, paid_quantity = t.paid_quantity + agg.qty,
         updated_at=CURRENT_TIMESTAMP, version=t.version+1
     FROM agg WHERE t.id = agg.ticket_type_id`,
    [orderId],
  );
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
    body: `Order ${order.order_number} sudah lunas. Tiket diproses ke dompet Anda.`,
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
      body: `Ada order lunas untuk event Anda. Cek laporan penjualan.`,
      actionPath: "/dashboard/laporan",
      entityType: "Order",
      entityId: orderId,
      deduplicationKey: `sale:${orderId}:${owner}`,
      domainEventId: `pay-ok:${orderId}`,
    });
  }
}

/**
 * Re-runs the idempotent post-payment steps for PAID orders that a crash left half-finished
 * (reservation still open). Orders paid within the last minute are skipped to avoid racing a live request.
 */
export async function recoverPaidOrders(limit = 20): Promise<{ recovered: number }> {
  const rows = await query<PaidOrderRow>(
    `SELECT o.id, o.buyer_user_id, o.event_id, o.order_number, o.total_payable_rupiah
     FROM orders o
     WHERE o.status='PAID'::order_status AND o.paid_at < CURRENT_TIMESTAMP - INTERVAL '1 minute'
       AND EXISTS (SELECT 1 FROM inventory_reservations r WHERE r.order_id=o.id AND r.released_at IS NULL)
     ORDER BY o.paid_at LIMIT $1`,
    [Math.min(Math.max(limit, 1), 100)],
  );
  for (const row of rows) await finalizePaidOrder(row);
  return { recovered: rows.length };
}

/** Finalizes a single PAID order (used when a webhook retry finds the order already marked PAID). */
export async function recoverPaidOrderById(orderId: string): Promise<void> {
  const rows = await query<PaidOrderRow>(
    `SELECT id, buyer_user_id, event_id, order_number, total_payable_rupiah
     FROM orders WHERE id=$1 AND status='PAID'::order_status`,
    [orderId],
  );
  if (rows[0]) await finalizePaidOrder(rows[0]);
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
  // The simulator only exists for sandbox-provider payments; a Midtrans payment must really be paid.
  if (pay.provider !== "sandbox" || activePaymentProvider() !== "sandbox")
    throw new AppError("FORBIDDEN", "Simulasi pembayaran tidak tersedia.", {}, 403);
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
