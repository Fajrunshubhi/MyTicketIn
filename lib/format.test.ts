import { describe, expect, it } from "vitest";
import { formatClockWithZone, formatDateTime, formatLiveClock, formatLiveClockDate, formatRupiah, formatCheckInBefore, eventHasEnded, eventLifecycle, naiveLocalToUtcIso, utcIsoToNaiveLocal } from "./format";

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

  it("shows live clock with seconds and WIB", () => {
    const full = formatLiveClock("2026-01-01T00:00:00.000Z", "Asia/Jakarta");
    const compact = formatLiveClock("2026-01-01T00:00:00.000Z", "Asia/Jakarta", true);
    expect(full).toMatch(/07/);
    expect(full).toMatch(/2026|26/);
    expect(full).toMatch(/WIB/);
    expect(compact).toMatch(/07/);
    expect(compact).toMatch(/00/);
    expect(compact).toMatch(/WIB/);
    expect(formatLiveClockDate("2026-01-01T00:00:00.000Z", "Asia/Jakarta")).toMatch(/2026|26/);
  });

  it("shows clock with WIB for Asia/Jakarta", () => {
    expect(formatClockWithZone("2026-01-01T00:00:00.000Z", "Asia/Jakarta")).toMatch(/07/);
    expect(formatClockWithZone("2026-01-01T00:00:00.000Z", "Asia/Jakarta")).toMatch(/WIB/);
  });

  it("states check-in deadline from the event start", () => {
    expect(formatCheckInBefore("2026-01-01T00:00:00.000Z", "Asia/Jakarta")).toMatch(/^Check-in sebelum /);
    expect(formatCheckInBefore("2026-01-01T00:00:00.000Z", "Asia/Jakarta")).toMatch(/07/);
  });

  it("labels a published past event as selesai, not terbit", () => {
    const now = Date.parse("2026-09-28T00:00:00.000Z");
    const past = eventLifecycle("PUBLISHED", "2026-09-25T02:00:00.000Z", "2026-09-25T06:00:00.000Z", now);
    expect(past.label).toBe("Selesai");
    expect(past.hint).toBe("Event telah selesai");
    const future = eventLifecycle("PUBLISHED", "2026-10-02T02:00:00.000Z", "2026-10-02T06:00:00.000Z", now);
    expect(future.label).toBe("Terbit");
  });

  it("round-trips naive local time in Asia/Jakarta", () => {
    const iso = naiveLocalToUtcIso("2026-01-01T07:00", "Asia/Jakarta");
    expect(iso).toBe("2026-01-01T00:00:00.000Z");
    expect(utcIsoToNaiveLocal(iso, "Asia/Jakarta")).toBe("2026-01-01T07:00");
  });
});
