import { describe, expect, it } from "vitest";
import { terbilangRupiah } from "./rupiah-terbilang";

describe("terbilangRupiah", () => {
  it("spells common kuitansi amounts", () => {
    expect(terbilangRupiah(0)).toBe("Nol rupiah");
    expect(terbilangRupiah(1)).toBe("Satu rupiah");
    expect(terbilangRupiah(11)).toBe("Sebelas rupiah");
    expect(terbilangRupiah(21)).toBe("Dua puluh satu rupiah");
    expect(terbilangRupiah(100)).toBe("Seratus rupiah");
    expect(terbilangRupiah(1000)).toBe("Seribu rupiah");
    expect(terbilangRupiah(245000)).toBe("Dua ratus empat puluh lima ribu rupiah");
    expect(terbilangRupiah(2500000)).toBe("Dua juta lima ratus ribu rupiah");
    expect(terbilangRupiah(5000001)).toBe("Lima juta satu rupiah");
  });

  it("rejects non-integers", () => {
    expect(() => terbilangRupiah(100.5)).toThrow();
  });
});
