import { describe, expect, it } from "vitest";
import { normalizePromoCode, promoDiscountRupiah } from "./promo-discount";

describe("F78 promo discount math (integer Rupiah)", () => {
  it("rounds a percentage down and honours the cap", () => {
    expect(promoDiscountRupiah({ discountType: "PERCENT", discountValue: 15, maxDiscountRupiah: null }, 99_999)).toBe(14_999);
    expect(promoDiscountRupiah({ discountType: "PERCENT", discountValue: 50, maxDiscountRupiah: 20_000 }, 200_000)).toBe(20_000);
  });

  it("applies a fixed amount but never more than 90% of the subtotal", () => {
    expect(promoDiscountRupiah({ discountType: "FIXED", discountValue: 25_000, maxDiscountRupiah: null }, 100_000)).toBe(25_000);
    expect(promoDiscountRupiah({ discountType: "FIXED", discountValue: 500_000, maxDiscountRupiah: null }, 100_000)).toBe(90_000);
    expect(promoDiscountRupiah({ discountType: "PERCENT", discountValue: 90, maxDiscountRupiah: null }, 1)).toBe(0);
  });

  it("returns zero for invalid subtotals instead of a negative or fractional value", () => {
    for (const subtotal of [0, -5, 10.5, Number.NaN]) {
      expect(promoDiscountRupiah({ discountType: "FIXED", discountValue: 1000, maxDiscountRupiah: null }, subtotal)).toBe(0);
    }
  });

  it("normalizes codes case-insensitively and rejects odd characters", () => {
    expect(normalizePromoCode("  hemat10 ")).toBe("HEMAT10");
    for (const bad of ["ab", "a b c", "kode!", "x".repeat(33), "", null, undefined, "'; DROP TABLE promo_codes;--"]) {
      expect(normalizePromoCode(bad)).toBeNull();
    }
  });
});
