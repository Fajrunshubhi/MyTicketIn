import { describe, expect, it } from "vitest";
import { maxSaleEndsAt, saleWindowError } from "./sales-window";

describe("saleWindowError", () => {
  const eventStart = new Date("2026-10-16T12:00:00.000Z");

  it("allows sale end exactly 24 hours before start", () => {
    expect(
      saleWindowError(new Date("2026-09-01T00:00:00.000Z"), new Date("2026-10-15T12:00:00.000Z"), eventStart),
    ).toBeNull();
  });

  it("rejects sale end inside the last 24 hours", () => {
    expect(
      saleWindowError(new Date("2026-09-01T00:00:00.000Z"), new Date("2026-10-15T18:00:00.000Z"), eventStart),
    ).toMatch(/H-1/);
  });

  it("computes max sale end as event start minus 24h", () => {
    expect(maxSaleEndsAt(eventStart).toISOString()).toBe("2026-10-15T12:00:00.000Z");
  });
});
