import { AppError, execute, newId, query } from "@/lib/server/http";
import { getOwnedEvent } from "@/lib/server/events-organizer";
import { normalizePromoCode, promoDiscountRupiah } from "@/lib/promo-discount";

type PromoRow = {
  id: string;
  code: string;
  discount_type: "PERCENT" | "FIXED";
  discount_value: string;
  max_discount_rupiah: string | null;
  min_subtotal_rupiah: string;
  max_redemptions: number | null;
  redeemed_count: number;
  active_now: boolean;
};

const INVALID = "Kode promo tidak valid atau tidak berlaku.";

/**
 * Read-only check used by the checkout summary and again by order creation. It consumes nothing; the quota is
 * only taken by `reservePromo` when the order is created. Unknown, disabled, not-yet-started and expired codes
 * share one message so the endpoint cannot be used to find out which codes exist.
 */
export async function evaluatePromo(rawCode: unknown, eventId: string, buyerId: string, subtotalRupiah: number) {
  const code = normalizePromoCode(rawCode);
  if (!code) throw new AppError("PROMO_INVALID", INVALID, {}, 400);
  const rows = await query<PromoRow>(
    `SELECT id, code, discount_type, discount_value::text, max_discount_rupiah::text, min_subtotal_rupiah::text,
            max_redemptions, redeemed_count,
            (status = 'ACTIVE' AND starts_at <= CURRENT_TIMESTAMP AND ends_at > CURRENT_TIMESTAMP) AS active_now
     FROM promo_codes WHERE event_id = $1 AND code = $2 LIMIT 1`,
    [eventId, code],
  );
  const p = rows[0];
  if (!p || !p.active_now) throw new AppError("PROMO_INVALID", INVALID, {}, 400);
  const min = Number(p.min_subtotal_rupiah);
  if (subtotalRupiah < min) {
    throw new AppError(
      "PROMO_MIN_SUBTOTAL",
      `Kode ini berlaku untuk pembelian minimal Rp${min.toLocaleString("id-ID")}.`,
      {},
      409,
    );
  }
  if (p.max_redemptions !== null && p.redeemed_count >= p.max_redemptions) {
    throw new AppError("PROMO_EXHAUSTED", "Kuota kode promo sudah habis.", {}, 409);
  }
  const used = await query<{ id: string }>(
    `SELECT id FROM promo_redemptions WHERE promo_code_id = $1 AND buyer_user_id = $2 AND status = 'ACTIVE' LIMIT 1`,
    [p.id, buyerId],
  );
  if (used[0]) throw new AppError("PROMO_ALREADY_USED", "Kode promo ini sudah Anda gunakan.", {}, 409);
  const discount = promoDiscountRupiah(
    {
      discountType: p.discount_type,
      discountValue: Number(p.discount_value),
      maxDiscountRupiah: p.max_discount_rupiah ? Number(p.max_discount_rupiah) : null,
    },
    subtotalRupiah,
  );
  if (discount <= 0) throw new AppError("PROMO_INVALID", INVALID, {}, 400);
  return { promoId: p.id, code: p.code, discountRupiah: discount };
}

/**
 * Takes one use of the code for an order in a single statement: the redemption insert and the counter increment
 * succeed or fail together. A concurrent over-redemption is stopped by `promo_codes_limit_chk` (the statement
 * errors and nothing is kept) and a second use by the same buyer by the partial unique index (no row inserted).
 */
export async function reservePromo(orderId: string, buyerId: string, promoId: string, discountRupiah: number) {
  let rows: { id: string }[];
  try {
    rows = await query<{ id: string }>(
      `WITH ins AS (
         INSERT INTO promo_redemptions (id, promo_code_id, order_id, buyer_user_id, discount_rupiah)
         SELECT $1::text, pc.id, $3::text, $4::text, $5::bigint FROM promo_codes pc
         WHERE pc.id = $2::text AND pc.status = 'ACTIVE' AND pc.starts_at <= CURRENT_TIMESTAMP AND pc.ends_at > CURRENT_TIMESTAMP
           AND (pc.max_redemptions IS NULL OR pc.redeemed_count < pc.max_redemptions)
         ON CONFLICT DO NOTHING
         RETURNING promo_code_id
       )
       UPDATE promo_codes SET redeemed_count = redeemed_count + 1, updated_at = CURRENT_TIMESTAMP, version = version + 1
       WHERE id IN (SELECT promo_code_id FROM ins) RETURNING id`,
      [newId(), promoId, orderId, buyerId, discountRupiah],
    );
  } catch (err) {
    if (err instanceof AppError && err.code === "VALIDATION_ERROR") {
      throw new AppError("PROMO_EXHAUSTED", "Kuota kode promo sudah habis.", {}, 409);
    }
    throw err;
  }
  if (rows[0]) return;
  const mine = await query<{ id: string }>(
    `SELECT id FROM promo_redemptions WHERE promo_code_id = $1 AND buyer_user_id = $2 AND status = 'ACTIVE' LIMIT 1`,
    [promoId, buyerId],
  );
  if (mine[0]) throw new AppError("PROMO_ALREADY_USED", "Kode promo ini sudah Anda gunakan.", {}, 409);
  throw new AppError("PROMO_EXHAUSTED", "Kode promo tidak lagi tersedia.", {}, 409);
}

/** Frees the use exactly once: the conditional update decides, so replays and races cannot decrement twice. */
export async function releasePromo(orderId: string, reason: "ORDER_EXPIRED" | "ORDER_FAILED" | "ORDER_CANCELLED") {
  await execute(
    `WITH r AS (
       UPDATE promo_redemptions SET status = 'RELEASED', released_at = CURRENT_TIMESTAMP, release_reason = $2
       WHERE order_id = $1 AND status = 'ACTIVE' RETURNING promo_code_id
     )
     UPDATE promo_codes SET redeemed_count = GREATEST(redeemed_count - 1, 0), updated_at = CURRENT_TIMESTAMP, version = version + 1
     WHERE id IN (SELECT promo_code_id FROM r)`,
    [orderId, reason],
  );
}

export type PromoInput = {
  code: unknown;
  discountType: unknown;
  discountValue: unknown;
  maxDiscountRupiah?: unknown;
  minSubtotalRupiah?: unknown;
  startsAt: unknown;
  endsAt: unknown;
  maxRedemptions?: unknown;
};

function intIn(raw: unknown, min: number, max: number, field: string, label: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new AppError("VALIDATION_ERROR", `${label} tidak valid.`, { [field]: `${label} tidak valid.` }, 400);
  }
  return n;
}

function when(raw: unknown, field: string, label: string): Date {
  const d = new Date(String(raw ?? ""));
  if (Number.isNaN(d.getTime())) {
    throw new AppError("VALIDATION_ERROR", `${label} tidak valid.`, { [field]: `${label} tidak valid.` }, 400);
  }
  return d;
}

function present(raw: unknown): boolean {
  return raw !== undefined && raw !== null && raw !== "";
}

function normalizeInput(body: PromoInput) {
  const code = normalizePromoCode(body.code);
  if (!code) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Kode 3–32 karakter: huruf, angka, _ atau -.",
      { code: "Kode 3–32 karakter: huruf, angka, _ atau -." },
      400,
    );
  }
  const type = body.discountType === "FIXED" ? "FIXED" : body.discountType === "PERCENT" ? "PERCENT" : null;
  if (!type) throw new AppError("VALIDATION_ERROR", "Jenis potongan tidak valid.", { discountType: "Pilih persen atau nominal." }, 400);
  const value =
    type === "PERCENT"
      ? intIn(body.discountValue, 1, 90, "discountValue", "Persentase (1–90)")
      : intIn(body.discountValue, 1, 9_000_000_000_000, "discountValue", "Nominal potongan");
  const cap = type === "PERCENT" && present(body.maxDiscountRupiah) ? intIn(body.maxDiscountRupiah, 1, 9_000_000_000_000, "maxDiscountRupiah", "Batas potongan") : null;
  const min = present(body.minSubtotalRupiah) ? intIn(body.minSubtotalRupiah, 0, 9_000_000_000_000, "minSubtotalRupiah", "Minimal pembelian") : 0;
  const startsAt = when(body.startsAt, "startsAt", "Tanggal mulai");
  const endsAt = when(body.endsAt, "endsAt", "Tanggal berakhir");
  if (endsAt <= startsAt) {
    throw new AppError("VALIDATION_ERROR", "Tanggal berakhir harus setelah tanggal mulai.", { endsAt: "Harus setelah tanggal mulai." }, 400);
  }
  const max = present(body.maxRedemptions) ? intIn(body.maxRedemptions, 1, 1_000_000, "maxRedemptions", "Kuota pemakaian") : null;
  return { code, type, value, cap, min, startsAt, endsAt, max };
}

type PromoView = {
  id: string;
  code: string;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  maxDiscountRupiah: number | null;
  minSubtotalRupiah: number;
  startsAt: string;
  endsAt: string;
  maxRedemptions: number | null;
  redeemedCount: number;
  status: "ACTIVE" | "DISABLED";
  state: "ACTIVE" | "SCHEDULED" | "EXPIRED" | "DISABLED" | "EXHAUSTED";
  version: number;
};

const COLS = `id, code, discount_type, discount_value::text, max_discount_rupiah::text, min_subtotal_rupiah::text,
  starts_at::text, ends_at::text, max_redemptions, redeemed_count, status, version,
  CASE WHEN status = 'DISABLED' THEN 'DISABLED'
       WHEN ends_at <= CURRENT_TIMESTAMP THEN 'EXPIRED'
       WHEN starts_at > CURRENT_TIMESTAMP THEN 'SCHEDULED'
       WHEN max_redemptions IS NOT NULL AND redeemed_count >= max_redemptions THEN 'EXHAUSTED'
       ELSE 'ACTIVE' END AS state`;

function view(r: Record<string, unknown>): PromoView {
  return {
    id: String(r.id),
    code: String(r.code),
    discountType: r.discount_type as PromoView["discountType"],
    discountValue: Number(r.discount_value),
    maxDiscountRupiah: r.max_discount_rupiah ? Number(r.max_discount_rupiah) : null,
    minSubtotalRupiah: Number(r.min_subtotal_rupiah),
    startsAt: new Date(String(r.starts_at)).toISOString(),
    endsAt: new Date(String(r.ends_at)).toISOString(),
    maxRedemptions: r.max_redemptions === null ? null : Number(r.max_redemptions),
    redeemedCount: Number(r.redeemed_count),
    status: r.status as PromoView["status"],
    state: r.state as PromoView["state"],
    version: Number(r.version),
  };
}

export async function listPromos(orgId: string, eventId: string): Promise<PromoView[]> {
  await getOwnedEvent(orgId, eventId);
  const rows = await query<Record<string, unknown>>(
    `SELECT ${COLS} FROM promo_codes WHERE event_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [eventId],
  );
  return rows.map(view);
}

export async function createPromo(orgId: string, eventId: string, body: PromoInput): Promise<PromoView> {
  await getOwnedEvent(orgId, eventId);
  const p = normalizeInput(body);
  const dup = await query<{ id: string }>(`SELECT id FROM promo_codes WHERE event_id = $1 AND code = $2 LIMIT 1`, [eventId, p.code]);
  if (dup[0]) throw new AppError("PROMO_CODE_EXISTS", "Kode ini sudah dipakai di event ini.", { code: "Kode sudah dipakai." }, 409);
  const rows = await query<Record<string, unknown>>(
    `INSERT INTO promo_codes (id, event_id, organizer_profile_id, code, discount_type, discount_value, max_discount_rupiah,
                              min_subtotal_rupiah, starts_at, ends_at, max_redemptions)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${COLS}`,
    [newId(), eventId, orgId, p.code, p.type, p.value, p.cap, p.min, p.startsAt.toISOString(), p.endsAt.toISOString(), p.max],
  );
  return view(rows[0]);
}

/**
 * Only things that are safe to change after buyers may have used the code: the end date, the quota (never below
 * what was already used) and on/off. The discount itself is immutable so earlier snapshots stay explainable.
 */
export async function updatePromo(
  orgId: string,
  eventId: string,
  promoId: string,
  body: { status?: unknown; endsAt?: unknown; maxRedemptions?: unknown },
): Promise<PromoView> {
  await getOwnedEvent(orgId, eventId);
  const cur = await query<Record<string, unknown>>(`SELECT ${COLS} FROM promo_codes WHERE id = $1 AND event_id = $2 LIMIT 1`, [promoId, eventId]);
  if (!cur[0]) throw new AppError("NOT_FOUND", "Kode promo tidak ditemukan.", {}, 404);
  const now = view(cur[0]);
  const status = body.status === undefined ? now.status : body.status === "DISABLED" ? "DISABLED" : body.status === "ACTIVE" ? "ACTIVE" : null;
  if (!status) throw new AppError("VALIDATION_ERROR", "Status tidak valid.", {}, 400);
  const endsAt = body.endsAt === undefined ? new Date(now.endsAt) : when(body.endsAt, "endsAt", "Tanggal berakhir");
  if (endsAt <= new Date(now.startsAt)) {
    throw new AppError("VALIDATION_ERROR", "Tanggal berakhir harus setelah tanggal mulai.", { endsAt: "Harus setelah tanggal mulai." }, 400);
  }
  let max = now.maxRedemptions;
  if (body.maxRedemptions !== undefined) {
    max = present(body.maxRedemptions) ? intIn(body.maxRedemptions, 1, 1_000_000, "maxRedemptions", "Kuota pemakaian") : null;
    if (max !== null && max < now.redeemedCount) {
      throw new AppError("VALIDATION_ERROR", "Kuota tidak boleh di bawah jumlah yang sudah dipakai.", { maxRedemptions: "Di bawah jumlah terpakai." }, 400);
    }
  }
  const rows = await query<Record<string, unknown>>(
    `UPDATE promo_codes SET status = $3, ends_at = $4, max_redemptions = $5, updated_at = CURRENT_TIMESTAMP, version = version + 1
     WHERE id = $1 AND event_id = $2 RETURNING ${COLS}`,
    [promoId, eventId, status, endsAt.toISOString(), max],
  );
  return view(rows[0]);
}
