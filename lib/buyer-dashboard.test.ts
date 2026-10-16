import { describe, expect, it } from "vitest";
import { compactRupiah, fillMonthlySpend, statusSlices, withOtherEvents } from "./buyer-dashboard";

describe("buyer dashboard charts", () => {
  it("fills six Jakarta months including zeros", () => {
    const now = Date.parse("2026-10-17T00:00:00.000Z");
    const series = fillMonthlySpend(now, [{ key: "2026-10", spentRupiah: 245000, orders: 1 }]);
    expect(series).toHaveLength(6);
    expect(series[0].key).toBe("2026-05");
    expect(series[0].spentRupiah).toBe(0);
    expect(series[5].key).toBe("2026-10");
    expect(series[5].spentRupiah).toBe(245000);
    expect(series[5].orders).toBe(1);
  });

  it("labels status slices in Indonesian and drops empty ones", () => {
    const slices = statusSlices([
      { status: "PAID", count: 4 },
      { status: "EXPIRED", count: 0 },
      { status: "PENDING", count: 2 },
    ]);
    expect(slices.map((s) => s.label)).toEqual(["Lunas", "Menunggu bayar"]);
  });

  it("compacts rupiah with integer math", () => {
    expect(compactRupiah(245000)).toBe("Rp245 rb");
    expect(compactRupiah(2_500_000)).toBe("Rp2,5 jt");
    expect(compactRupiah(900)).toBe("Rp900");
  });

  it("folds extra events into a single Lainnya bar", () => {
    const top = [
      { eventId: "a", title: "Jazz", spentRupiah: 900000, orders: 2 },
      { eventId: "b", title: "Run", spentRupiah: 400000, orders: 1 },
    ];
    const folded = withOtherEvents(top, { eventCount: 12, spentRupiah: 250000, orders: 12 });
    expect(folded).toHaveLength(3);
    expect(folded[2]?.eventId).toBe("lainnya");
    expect(folded[2]?.title).toContain("12");
    expect(folded[2]?.spentRupiah).toBe(250000);
    expect(withOtherEvents(top, { eventCount: 0, spentRupiah: 0, orders: 0 })).toHaveLength(2);
  });
});
