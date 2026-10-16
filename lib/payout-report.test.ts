import { describe, expect, it } from "vitest";
import { payoutReportIntegrityHash, withPayoutReportDocument } from "./payout-report-integrity";
import { buildPayoutReportCsv, type PayoutReport } from "./payout-report";
import { buildPayoutReportPdfBytes } from "./payout-report-pdf";

const report: PayoutReport = {
  eventId: "evt-1",
  eventTitle: "Jazz on the Park Jakarta",
  venueLine: "GBK, Jakarta",
  startsAt: "2026-10-18T12:00:00.000Z",
  endsAt: "2026-10-18T16:00:00.000Z",
  timezone: "Asia/Jakarta",
  organizerName: "Joko Event 2027",
  payoutNumber: "PYT-ABC123",
  payoutStatus: "REQUESTED",
  payoutAmountRupiah: 432500,
  bankName: "BCA",
  bankAccountName: "Joko Event 2027",
  bankAccountMasked: "******7890",
  generatedAt: "2026-10-17T00:00:00.000Z",
  grossRupiah: 995000,
  refundedRupiah: 562500,
  netRupiah: 432500,
  paidOrderCount: 2,
  ticketCount: 2,
  holders: [
    {
      ticketNumber: "TKT-1",
      orderNumber: "MTI-EEC6CDB126",
      holderName: "Ahmad budi",
      holderEmail: "ahmad@gmail.com",
      holderPhone: "08123456789",
      holderIdentityNumber: "3171010101010001",
      ticketTypeName: "Early Bird",
      sectionName: "",
      seatLabel: "",
      ticketStatus: "UNUSED",
      unitPriceRupiah: 250000,
      orderPayableRupiah: 250000,
      orderRefundedRupiah: 0,
    },
  ],
  refunds: [{ refundNumber: "RFND-1", orderNumber: "MTI-OTHER", amountRupiah: 562500, source: "BUYER" }],
};

describe("payout supporting report", () => {
  it("writes Excel-friendly CSV with buyers, totals, and refunds", () => {
    const csv = buildPayoutReportCsv(withPayoutReportDocument(report));
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("LAPORAN REKAPITULASI PENJUALAN");
    expect(csv).toContain("Net pencairan");
    expect(csv).toContain("Ahmad budi");
    expect(csv).toContain("3171010101010001");
    expect(csv).toContain("RFND-1");
    expect(csv).toContain("Pembatalan pembeli");
    expect(csv).toContain("LPP/PYT-ABC123");
    expect(csv).toContain("Kode keutuhan SHA-256");
  });

  it("builds an official letterhead PDF with legal clauses and terbilang", () => {
    const raw = new TextDecoder("latin1").decode(buildPayoutReportPdfBytes(report));
    expect(raw.startsWith("%PDF-1.4")).toBe(true);
    expect(raw).toContain("LAPORAN REKAPITULASI PENJUALAN");
    expect(raw).toContain("DITERBITKAN OLEH");
    expect(raw).toContain("DITUJUKAN KEPADA");
    expect(raw).toContain("Ahmad budi");
    expect(raw).toContain("TKT-1");
    expect(raw).toContain("Net pencairan");
    expect(raw).toContain("Terbilang");
    expect(raw).toContain("REFUND SELESAI");
    expect(raw).toContain("NIK 3171010101010001");
    expect(raw).toContain("UU ITE");
    expect(raw).toContain("Bukan faktur pajak");
    expect(raw).toContain("SHA-256");
    expect(raw).toContain("DIAJUKAN");
  });

  it("keeps a stable integrity hash for the same totals and tickets", () => {
    const a = payoutReportIntegrityHash(report);
    const b = payoutReportIntegrityHash({ ...report, organizerName: "Nama lain" });
    expect(a).toHaveLength(64);
    expect(a).toBe(b);
    expect(payoutReportIntegrityHash({ ...report, netRupiah: 1 })).not.toBe(a);
  });
});
