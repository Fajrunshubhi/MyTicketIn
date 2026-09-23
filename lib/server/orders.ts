import { createHash } from "crypto";
import { AppError, execute, newId, query, tokenHash } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";

type CheckoutLine = {
  ticketTypeId: string;
  quantity: number;
  attendees?: { fullName?: string; email?: string; phone?: string; identityNumber?: string }[];
};

export async function listOrders(user: AuthUser, limit: number) {
  const lim = Math.min(Math.max(limit || 20, 1), 50);
  const rows = await query<Record<string, unknown>>(
    `SELECT id, order_number, event_id, status::text AS status, currency, subtotal_rupiah, loyalty_discount_rupiah,
            total_payable_rupiah, expires_at::text, created_at::text, version
     FROM orders WHERE buyer_user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
    [user.id, lim],
  );
  return rows.map(orderDto);
}

export async function getOrder(user: AuthUser, id: string) {
  const rows = await query<Record<string, unknown>>(
    `SELECT id, order_number, buyer_user_id, event_id, status::text AS status, currency, subtotal_rupiah,
            loyalty_discount_rupiah, total_payable_rupiah, redeemed_points, expires_at::text, created_at::text, version
     FROM orders WHERE id = $1 LIMIT 1`,
    [id],
  );
  const o = rows[0];
  if (!o) throw new AppError("NOT_FOUND", "Order tidak ditemukan.", {}, 404);
  if (o.buyer_user_id !== user.id && user.role !== "ADMIN") throw new AppError("NOT_FOUND", "Order tidak ditemukan.", {}, 404);
  const items = await query<Record<string, unknown>>(
    `SELECT id, ticket_type_id, ticket_type_name, section_name, seat_label, event_seat_id, unit_price_rupiah, quantity, line_total_rupiah
     FROM order_items WHERE order_id = $1 ORDER BY id`,
    [id],
  );
  const ev = await query<{ id: string; title: string; slug: string }>(
    `SELECT id, title, slug FROM events WHERE id=$1 LIMIT 1`,
    [o.event_id],
  );
  return {
    ...orderDto(o),
    event: ev[0] ? { id: ev[0].id, title: ev[0].title, slug: ev[0].slug } : undefined,
    items: items.map(itemDto),
  };
}

function orderDto(o: Record<string, unknown>) {
  return {
    id: o.id,
    orderNumber: o.order_number,
    eventId: o.event_id,
    status: o.status,
    currency: o.currency,
    subtotalRupiah: Number(o.subtotal_rupiah),
    loyaltyDiscountRupiah: Number(o.loyalty_discount_rupiah),
    totalPayableRupiah: Number(o.total_payable_rupiah),
    expiresAt: o.expires_at ? new Date(String(o.expires_at)).toISOString() : null,
    serverTime: new Date().toISOString(),
    createdAt: o.created_at ? new Date(String(o.created_at)).toISOString() : null,
    version: o.version,
  };
}

function itemDto(it: Record<string, unknown>) {
  return {
    id: it.id,
    ticketTypeId: it.ticket_type_id,
    ticketTypeName: it.ticket_type_name,
    name: it.ticket_type_name,
    sectionName: it.section_name,
    seatLabel: it.seat_label,
    eventSeatId: it.event_seat_id,
    unitPriceRupiah: Number(it.unit_price_rupiah),
    quantity: Number(it.quantity),
    lineTotalRupiah: Number(it.line_total_rupiah),
  };
}

function maxRedeemablePoints(subtotalRupiah: number): number {
  return Math.floor(Math.floor(subtotalRupiah / 5) / 10);
}

export async function summarize(user: AuthUser, body: { eventId: string; items?: CheckoutLine[]; redeemPoints?: number }) {
  const plan = await planCheckout(body);
  const requested = Math.max(0, Number(body.redeemPoints || 0));
  if (!Number.isInteger(requested)) throw new AppError("VALIDATION_ERROR", "Poin harus bilangan bulat.", {}, 400);
  const acc = await query<{ balance_points: number; debt_points: number; reserved_points: number }>(
    `SELECT balance_points, debt_points, reserved_points FROM loyalty_accounts
     WHERE buyer_user_id=$1 AND organizer_profile_id=$2 LIMIT 1`,
    [user.id, plan.event.organizerProfileId],
  );
  const availablePoints = Math.max(
    0,
    Number(acc[0]?.balance_points || 0) - Number(acc[0]?.reserved_points || 0) - Number(acc[0]?.debt_points || 0),
  );
  const cap = maxRedeemablePoints(plan.subtotal);
  if (requested > availablePoints) {
    throw new AppError("LOYALTY_INSUFFICIENT_POINTS", "Poin tidak mencukupi.", {}, 409);
  }
  if (requested > cap) {
    throw new AppError("LOYALTY_REDEMPTION_LIMIT_EXCEEDED", "Penukaran poin melebihi 20% subtotal.", {}, 409);
  }
  const discount = requested * 10;
  return {
    event: plan.event,
    items: plan.lines.map((line) => ({
      ticketTypeId: line.ticketTypeId,
      name: line.name,
      quantity: line.quantity,
      unitPriceRupiah: line.unit,
      lineTotalRupiah: line.lineTotal,
    })),
    subtotalRupiah: plan.subtotal,
    requestedRedeemPoints: requested,
    appliedRedeemPoints: requested,
    loyaltyDiscountRupiah: discount,
    totalPayableRupiah: plan.subtotal - discount,
    currency: "IDR",
    reservationMinutes: 15,
    availablePoints,
    maxRedeemablePoints: cap,
    organizerName: plan.organizerName,
    cashValue: false,
    sandbox: true,
  };
}

async function planCheckout(body: { eventId: string; items?: CheckoutLine[] }) {
  const eventId = String(body.eventId || "");
  const ev = await query<{
    id: string;
    status: string;
    title: string;
    slug: string;
    timezone: string;
    organizer_profile_id: string;
  }>(
    `SELECT id, status::text AS status, title, slug, timezone, organizer_profile_id FROM events WHERE id = $1 LIMIT 1`,
    [eventId],
  );
  if (!ev[0] || ev[0].status !== "PUBLISHED") throw new AppError("ORDER_NOT_PURCHASABLE", "Event tidak dapat dibeli.", {}, 409);
  const org = await query<{ name: string }>(`SELECT name FROM organizer_profiles WHERE id=$1 LIMIT 1`, [ev[0].organizer_profile_id]);
  const items = body.items || [];
  if (!items.length) throw new AppError("CHECKOUT_INVALID", "Checkout tidak valid.", {}, 400);
  const lines: { ticketTypeId: string; name: string; quantity: number; unit: number; lineTotal: number }[] = [];
  let subtotal = 0;
  for (const it of items) {
    const qty = Number(it.quantity || 0);
    if (!Number.isInteger(qty) || qty < 1) throw new AppError("CHECKOUT_INVALID", "Checkout tidak valid.", {}, 400);
    const t = await query<{ id: string; name: string; price_rupiah: string | number; quota: number; reserved_quantity: number; paid_quantity: number }>(
      `SELECT id, name, price_rupiah, quota, reserved_quantity, paid_quantity FROM event_ticket_types WHERE id = $1 AND event_id = $2 LIMIT 1`,
      [it.ticketTypeId, eventId],
    );
    const ticket = t[0];
    if (!ticket) throw new AppError("CHECKOUT_INVALID", "Checkout tidak valid.", {}, 400);
    const remaining = ticket.quota - ticket.reserved_quantity - ticket.paid_quantity;
    if (remaining < qty) throw new AppError("INVENTORY_UNAVAILABLE", "Kuota tidak mencukupi.", {}, 409);
    const unit = Number(ticket.price_rupiah);
    const lineTotal = unit * qty;
    subtotal += lineTotal;
    lines.push({ ticketTypeId: ticket.id, name: ticket.name, quantity: qty, unit, lineTotal });
  }
  return {
    eventId,
    event: {
      id: ev[0].id,
      title: ev[0].title,
      slug: ev[0].slug,
      timezone: ev[0].timezone,
      organizerProfileId: ev[0].organizer_profile_id,
    },
    organizerName: org[0]?.name || "",
    subtotal,
    lines,
  };
}

export async function createOrder(user: AuthUser, body: { eventId: string; items?: CheckoutLine[]; confirmed?: boolean; redeemPoints?: number }, idemKey: string) {
  if (!body.confirmed) throw new AppError("CHECKOUT_INVALID", "Checkout tidak valid.", {}, 400);
  if (!idemKey || idemKey.length < 16 || idemKey.length > 128) {
    throw new AppError("IDEMPOTENCY_KEY_INVALID", "Idempotency-Key wajib 16–128 karakter.", {}, 400);
  }
  const plan = await planCheckout(body);
  const keyHash = tokenHash(idemKey);
  const reqHash = createHash("sha256").update(JSON.stringify({ eventId: body.eventId, items: body.items })).digest("hex");
  const claimId = newId();
  await query(
    `INSERT INTO idempotency_keys (id, actor_user_id, scope, key_hash, request_hash, status, expires_at, created_at, updated_at)
     VALUES ($1,$2,'CREATE_ORDER',$3,$4,'PROCESSING'::idempotency_status, transaction_timestamp() + INTERVAL '24 hours', transaction_timestamp(), transaction_timestamp())
     ON CONFLICT (actor_user_id, scope, key_hash) DO NOTHING`,
    [claimId, user.id, keyHash, reqHash],
  );
  const claimed = await query<{ id: string; status: string; request_hash: string; resource_id: string | null }>(
    `SELECT id, status::text AS status, request_hash, resource_id FROM idempotency_keys
     WHERE actor_user_id=$1 AND scope='CREATE_ORDER' AND key_hash=$2 LIMIT 1`,
    [user.id, keyHash],
  );
  const rec = claimed[0];
  if (rec && rec.id !== claimId) {
    if (rec.request_hash !== reqHash) throw new AppError("IDEMPOTENCY_KEY_REUSED", "Kunci idempotensi dipakai ulang.", {}, 409);
    if (rec.resource_id) return { view: await getOrder(user, rec.resource_id), replay: true };
  }
  const oid = newId();
  const orderNumber = `MTI-${oid.slice(0, 10).toUpperCase()}`;
  const orderRows = await query<Record<string, unknown>>(
    `INSERT INTO orders (
       id, order_number, buyer_user_id, event_id, status, currency, subtotal_rupiah, loyalty_discount_rupiah, total_payable_rupiah,
       redeemed_points, expires_at, created_at, updated_at, version
     ) VALUES (
       $1,$2,$3,$4,'PENDING'::order_status,'IDR',$5,0,$5,0,
       transaction_timestamp() + INTERVAL '15 minutes', transaction_timestamp(), transaction_timestamp(), 1
     ) RETURNING id, order_number, event_id, status::text AS status, currency, subtotal_rupiah, loyalty_discount_rupiah,
               total_payable_rupiah, expires_at::text, created_at::text, version, buyer_user_id`,
    [oid, orderNumber, user.id, plan.eventId, plan.subtotal],
  );
  const order = orderRows[0];
  if (!order) throw new AppError("INTERNAL_ERROR", "Terjadi kesalahan internal.", {}, 500);
  for (const line of plan.lines) {
    const iid = newId();
    await query(
      `INSERT INTO order_items (id, order_id, ticket_type_id, ticket_type_name, unit_price_rupiah, quantity, line_total_rupiah)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [iid, oid, line.ticketTypeId, line.name, line.unit, line.quantity, line.lineTotal],
    );
    const rid = newId();
    await query(
      `INSERT INTO inventory_reservations (id, order_id, order_item_id, ticket_type_id, quantity, expires_at)
       SELECT $1,$2,$3,$4,$5, expires_at FROM orders WHERE id=$2`,
      [rid, oid, iid, line.ticketTypeId, line.quantity],
    );
    const attendees = (body.items || []).find((it) => it.ticketTypeId === line.ticketTypeId)?.attendees || [];
    for (let seq = 1; seq <= line.quantity; seq += 1) {
      const person = attendees[seq - 1];
      if (!person) continue;
      const email = String(person.email || "").trim().toLowerCase();
      const fullName = String(person.fullName || "").trim();
      const phone = String(person.phone || "").replace(/\D/g, "");
      const nik = String(person.identityNumber || "").replace(/\D/g, "");
      if (fullName.length < 2 || !email.includes("@") || nik.length !== 16) continue;
      await query(
        `INSERT INTO order_attendees (
           id, order_id, order_item_id, event_id, unit_sequence, full_name, email, phone, identity_number
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [newId(), oid, iid, plan.eventId, seq, fullName, email, phone.slice(0, 20), nik],
      );
    }
    const reserved = await query<{ reserved_quantity: number }>(
      `UPDATE event_ticket_types SET reserved_quantity = reserved_quantity + $2, updated_at = CURRENT_TIMESTAMP, version = version + 1
       WHERE id=$1 AND reserved_quantity + paid_quantity + $2 <= quota
       RETURNING reserved_quantity`,
      [line.ticketTypeId, line.quantity],
    );
    if (!reserved[0]) throw new AppError("INVENTORY_UNAVAILABLE", "Kuota tidak mencukupi.", {}, 409);
  }
  await query(
    `UPDATE idempotency_keys SET
        status='COMPLETED'::idempotency_status,
        resource_type='Order',
        resource_id=$3,
        http_status=201,
        response_body='{}'::jsonb,
        updated_at=CURRENT_TIMESTAMP
     WHERE actor_user_id=$1 AND scope='CREATE_ORDER' AND key_hash=$2`,
    [user.id, keyHash, oid],
  );
  return { view: await getOrder(user, oid), replay: false };
}

export async function loyaltyAccount(user: AuthUser, organizerProfileId: string) {
  const org = await query<{ id: string; name: string }>(`SELECT id, name FROM organizer_profiles WHERE id=$1 LIMIT 1`, [organizerProfileId]);
  if (!org[0]) throw new AppError("NOT_FOUND", "Data tidak ditemukan.", {}, 404);
  const acc = await query<{ balance_points: number; debt_points: number; reserved_points: number }>(
    `SELECT balance_points, debt_points, reserved_points FROM loyalty_accounts WHERE buyer_user_id=$1 AND organizer_profile_id=$2 LIMIT 1`,
    [user.id, organizerProfileId],
  );
  const bal = Number(acc[0]?.balance_points || 0);
  const debt = Number(acc[0]?.debt_points || 0);
  const reserved = Number(acc[0]?.reserved_points || 0);
  return {
    organizer: { id: org[0].id, name: org[0].name },
    balancePoints: bal,
    debtPoints: debt,
    reservedPoints: reserved,
    availablePoints: Math.max(0, bal - reserved - debt),
    rate: { rupiahPerPoint: 10, maxCheckoutPercent: 20 },
    cashValue: false,
    sandbox: true,
  };
}

export async function expireDue(batch: number) {
  const n = Math.min(Math.max(batch || 20, 1), 100);
  const due = await query<{ id: string }>(
    `SELECT id FROM orders WHERE status='PENDING' AND expires_at <= CURRENT_TIMESTAMP ORDER BY expires_at ASC LIMIT $1`,
    [n],
  );
  let expired = 0;
  for (const row of due) {
    const ok = await execute(
      `UPDATE orders SET status='EXPIRED'::order_status, expired_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1
       WHERE id=$1 AND status='PENDING'`,
      [row.id],
    );
    if (!ok) continue;
    const res = await query<{ id: string; ticket_type_id: string; quantity: number }>(
      `UPDATE inventory_reservations SET released_at=CURRENT_TIMESTAMP, release_reason='EXPIRED'
       WHERE order_id=$1 AND released_at IS NULL RETURNING id, ticket_type_id, quantity`,
      [row.id],
    );
    for (const r of res) {
      await execute(
        `UPDATE event_ticket_types SET reserved_quantity = reserved_quantity - $2, updated_at=CURRENT_TIMESTAMP, version=version+1
         WHERE id=$1 AND reserved_quantity >= $2`,
        [r.ticket_type_id, r.quantity],
      );
    }
    expired += 1;
  }
  return { expired, scanned: due.length };
}
