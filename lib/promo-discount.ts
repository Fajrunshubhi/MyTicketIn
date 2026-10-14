export type PromoRule = {
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  maxDiscountRupiah: number | null;
};

/**
 * Integer Rupiah only. A promo never exceeds 90% of the subtotal, so an order is never free and a payment always
 * has an amount to charge (the same bound is enforced by `orders_money_chk`).
 */
export function promoDiscountRupiah(rule: PromoRule, subtotalRupiah: number): number {
  if (!Number.isInteger(subtotalRupiah) || subtotalRupiah <= 0) return 0;
  const raw =
    rule.discountType === "PERCENT"
      ? Math.floor((subtotalRupiah * rule.discountValue) / 100)
      : rule.discountValue;
  const capped = rule.maxDiscountRupiah ? Math.min(raw, rule.maxDiscountRupiah) : raw;
  return Math.max(0, Math.min(capped, Math.floor((subtotalRupiah * 9) / 10)));
}

/** Normalizes what a buyer typed. Codes are case-insensitive; anything outside A-Z, 0-9, _ and - is rejected. */
export function normalizePromoCode(raw: unknown): string | null {
  const code = String(raw ?? "").trim().toUpperCase();
  return /^[A-Z0-9_-]{3,32}$/.test(code) ? code : null;
}
