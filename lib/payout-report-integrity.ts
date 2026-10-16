import { createHash } from "node:crypto";
import { documentAppOrigin } from "@/lib/platform-document";
import type { PayoutReport } from "@/lib/payout-report";

export function payoutReportIntegrityHash(report: PayoutReport): string {
  const payload = [
    report.eventId,
    String(report.grossRupiah),
    String(report.refundedRupiah),
    String(report.netRupiah),
    String(report.paidOrderCount),
    String(report.ticketCount),
    report.holders.map((h) => `${h.ticketNumber}:${h.unitPriceRupiah}`).join(","),
    report.refunds.map((r) => `${r.refundNumber}:${r.amountRupiah}`).join(","),
  ].join("|");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function payoutReportDocumentNumber(report: PayoutReport, at = new Date()): string {
  if (report.documentNumber) return report.documentNumber;
  if (report.payoutNumber) return `LPP/${report.payoutNumber}`;
  const day = at.toISOString().slice(0, 10).replace(/-/g, "");
  const id = report.eventId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
  return `LPP/${id || "EVENT"}/${day}`;
}

export function withPayoutReportDocument(report: PayoutReport): PayoutReport {
  const generatedAt = report.generatedAt || new Date().toISOString();
  return {
    ...report,
    generatedAt,
    documentNumber: payoutReportDocumentNumber(report, new Date(generatedAt)),
    integrityHash: report.integrityHash || payoutReportIntegrityHash(report),
    verifyUrl: report.verifyUrl || `${documentAppOrigin()}/dashboard/payouts`,
  };
}
