import { describe, expect, it } from "vitest";
import { buildEventTicketPdfBytes, type EventTicketPdf } from "@/lib/ticket-pdf";

const ticket: EventTicketPdf = {
  ticketNumber: "T3589FF2A7F",
  manualCode: "3589FF2A7F24395F",
  status: "UNUSED",
  eventTitle: "Konser Musik",
  venueLine: "TRANS STUDIO BANDUNG, Bandung, Jawa Barat",
  startsAt: "2026-10-01T02:18:00.000Z",
  timezone: "Asia/Jakarta",
  ticketTypeName: "VIP",
  orderNumber: "MTI-5B563BE11E",
  holderName: "jruns",
  holderEmail: "jruns@gmail.com",
  holderPhone: "0822256356712",
  holderNik: "3278764466373777",
};

describe("buildEventTicketPdfBytes", () => {
  it("renders a letterhead e-ticket without an em dash and with a masked NIK", () => {
    const raw = new TextDecoder("latin1").decode(buildEventTicketPdfBytes(ticket));
    expect(raw.startsWith("%PDF-1.4")).toBe(true);
    expect(raw).toContain("MYTICKETIN");
    expect(raw).toContain("E-TIKET");
    expect(raw).toContain("SIAP DIPAKAI");
    expect(raw).toContain("Konser Musik");
    expect(raw).toContain("VIP");
    expect(raw).toContain("T3589FF2A7F");
    expect(raw).toContain("3589FF2A7F24395F");
    expect(raw).toContain("NIK");
    expect(raw).toContain("xxxxxxxxxxxx3777");
    expect(raw).not.toContain("3278764466373777");
    expect(raw).not.toMatch(/â/);
    expect(raw).toContain("Helvetica-Bold");
  });

  it("omits QR copy for cancelled tickets", () => {
    const raw = new TextDecoder("latin1").decode(buildEventTicketPdfBytes({ ...ticket, status: "CANCELLED" }));
    expect(raw).toContain("DIBATALKAN");
    expect(raw).toContain("QR tidak ditampilkan");
    expect(raw).not.toContain("SIAP DIPAKAI");
  });
});
