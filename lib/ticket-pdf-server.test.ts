import { describe, expect, it } from "vitest";
import { buildEventTicketPdfBytes } from "@/lib/ticket-pdf";
import { ticketQrMatrix } from "@/lib/server/qr-png";

const ticket = {
  ticketNumber: "TKT-1",
  manualCode: "ABCD1234EFGH5678",
  status: "UNUSED",
  eventTitle: "Konser Uji",
  venueLine: "GOR, Jakarta",
};

describe("ticket PDF with vector QR (email attachment)", () => {
  it("builds a valid PDF and draws the QR modules", () => {
    const plain = buildEventTicketPdfBytes(ticket);
    const withQr = buildEventTicketPdfBytes(ticket, null, ticketQrMatrix("ABCD1234EFGH5678"));
    expect(Buffer.from(withQr.slice(0, 5)).toString()).toBe("%PDF-");
    expect(withQr.byteLength).toBeGreaterThan(plain.byteLength + 500);
  });

  it("does not draw a QR for cancelled tickets", () => {
    const plain = buildEventTicketPdfBytes({ ...ticket, status: "CANCELLED" });
    const withQr = buildEventTicketPdfBytes({ ...ticket, status: "CANCELLED" }, null, ticketQrMatrix("ABCD1234EFGH5678"));
    expect(withQr.byteLength).toBe(plain.byteLength);
  });
});
