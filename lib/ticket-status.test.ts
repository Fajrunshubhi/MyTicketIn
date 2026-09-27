import { describe, expect, it } from "vitest";
import { ticketStatusClass, ticketStatusLabel } from "@/lib/ticket-status";

describe("ticketStatusLabel", () => {
  it("keeps unused upcoming tickets as ready to use", () => {
    expect(ticketStatusLabel("UNUSED", false)).toBe("Siap dipakai");
  });

  it("does not call unused tickets ready after the event ended", () => {
    expect(ticketStatusLabel("UNUSED", true)).toBe("Tidak berlaku");
    expect(ticketStatusLabel("USED", true)).toBe("Sudah check-in");
    expect(ticketStatusLabel("CANCELLED", true)).toBe("Dibatalkan");
  });

  it("uses muted styles for unused tickets after the event ended", () => {
    expect(ticketStatusClass("UNUSED", true)).toContain("stone-100");
    expect(ticketStatusClass("UNUSED", false)).toContain("gold-800");
  });
});
