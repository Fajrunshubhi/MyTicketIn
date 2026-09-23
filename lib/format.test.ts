import { describe, expect, it } from "vitest";
import { formatDateTime, formatRupiah, formatCheckInBefore, naiveLocalToUtcIso, utcIsoToNaiveLocal } from "./format";

describe("F55 formatters", () => {
  it("formats integer Rupiah without fractions", () => {
    expect(formatRupiah(125000)).toBe("Rp125.000");
  });

  it("rejects non-integer amounts", () => {
    expect(() => formatRupiah(125000.5)).toThrow();
  });

  it("shows UTC instant in Asia/Jakarta with a named zone", () => {
    const text = formatDateTime("2026-01-01T00:00:00.000Z", "Asia/Jakarta");
    expect(text).toMatch(/07/);
    expect(text.toUpperCase()).toMatch(/WIB|GMT\+7|\+07/);
  });

  it("states check-in deadline from the event start", () => {
    expect(formatCheckInBefore("2026-01-01T00:00:00.000Z", "Asia/Jakarta")).toMatch(/^Check-in sebelum /);
    expect(formatCheckInBefore("2026-01-01T00:00:00.000Z", "Asia/Jakarta")).toMatch(/07/);
  });

  it("round-trips naive local time in Asia/Jakarta", () => {
    const iso = naiveLocalToUtcIso("2026-01-01T07:00", "Asia/Jakarta");
    expect(iso).toBe("2026-01-01T00:00:00.000Z");
    expect(utcIsoToNaiveLocal(iso, "Asia/Jakarta")).toBe("2026-01-01T07:00");
  });
});
