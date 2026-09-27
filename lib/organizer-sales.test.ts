import { describe, expect, it } from "vitest";
import { organizerSalesBlocked } from "@/lib/organizer-sales";

describe("organizerSalesBlocked", () => {
  it("blocks purchase when organizer is suspended or revoked", () => {
    expect(organizerSalesBlocked("SUSPENDED")).toBe(true);
    expect(organizerSalesBlocked("REJECTED")).toBe(true);
  });

  it("allows purchase for approved organizer", () => {
    expect(organizerSalesBlocked("APPROVED")).toBe(false);
    expect(organizerSalesBlocked(null)).toBe(false);
  });
});
