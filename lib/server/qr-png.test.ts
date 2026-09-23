import { describe, expect, it } from "vitest";
import { renderTicketQrPng } from "@/lib/server/qr-png";

describe("renderTicketQrPng", () => {
  it("returns a PNG matrix rather than a text placeholder", async () => {
    const png = await renderTicketQrPng("ti1_test-token-not-pii");
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.byteLength).toBeGreaterThan(400);
  });
});
