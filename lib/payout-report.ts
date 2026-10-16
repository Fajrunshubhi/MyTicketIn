import { formatRupiah } from "@/lib/format";
import { refundSourceUiLabel } from "@/lib/order-refund-display";

export type PayoutReportHolder = {
  ticketNumber: string;
  orderNumber: string;
  holderName: string;
  holderEmail: string;
  holderPhone: string;
  holderIdentityNumber: string;
  ticketTypeName: string;
  sectionName: string;
  seatLabel: string;
  ticketStatus: string;
  unitPriceRupiah: number;
  orderPayableRupiah: number;
  orderRefundedRupiah: number;
};

export type PayoutReportRefund = {
  refundNumber: string;
  orderNumber: string;
  amountRupiah: number;
  source?: string;
  completedAt?: string | null;
};

export type PayoutReport = {
  eventId: string;
  eventTitle: string;
  venueLine: string;
  startsAt?: string | null;
  endsAt?: string | null;
  timezone: string;
  organizerName: string;
  payoutNumber?: string | null;
  payoutStatus?: string | null;
  payoutAmountRupiah?: number | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountMasked?: string | null;
  documentNumber?: string;
  generatedAt?: string;
  integrityHash?: string;
  verifyUrl?: string;
  grossRupiah: number;
  refundedRupiah: number;
  netRupiah: number;
  paidOrderCount: number;
  ticketCount: number;
  holders: PayoutReportHolder[];
  refunds: PayoutReportRefund[];
};

export function ticketStatusLabel(status: string): string {
  if (status === "UNUSED") return "Belum check-in";
  if (status === "USED") return "Sudah check-in";
  if (status === "CANCELLED") return "Dibatalkan";
  return status;
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function money(n: number): string {
  try {
    return formatRupiah(Math.max(0, Math.trunc(n)));
  } catch {
    return "Rp0";
  }
}

/** CSV UTF-8 (BOM) yang bisa dibuka Excel, berisi ringkasan keuangan + biodata pemegang. */
export function buildPayoutReportCsv(report: PayoutReport): string {
  const lines: string[] = [
    "LAPORAN REKAPITULASI PENJUALAN",
    "Lampiran pendukung pencairan dana penyelenggara",
    report.documentNumber ? `Nomor dokumen,${csvEscape(report.documentNumber)}` : "",
    `Event,${csvEscape(report.eventTitle)}`,
    `Penyelenggara,${csvEscape(report.organizerName)}`,
    `Lokasi,${csvEscape(report.venueLine)}`,
    report.payoutNumber ? `Nomor pencairan,${csvEscape(report.payoutNumber)}` : "",
    report.integrityHash ? `Kode keutuhan SHA-256,${csvEscape(report.integrityHash)}` : "",
    "Klasifikasi,RAHASIA - bukan faktur pajak",
    "",
    "RINGKASAN KEUANGAN",
    "Uraian,Nominal",
    `Penjualan lunas,${money(report.grossRupiah)}`,
    `Refund selesai,${money(report.refundedRupiah)}`,
    `Net pencairan,${money(report.netRupiah)}`,
    `Jumlah order lunas,${report.paidOrderCount}`,
    `Jumlah tiket,${report.ticketCount}`,
    "",
  ].filter((row) => row !== "");

  if (report.refunds.length > 0) {
    lines.push("REFUND SELESAI");
    lines.push("Nomor refund,Nomor order,Sumber,Nominal");
    for (const rf of report.refunds) {
      lines.push(
        [rf.refundNumber, rf.orderNumber, refundSourceUiLabel(rf.source), money(rf.amountRupiah)].map(csvEscape).join(","),
      );
    }
    lines.push("");
  }

  lines.push("BIODATA PEMEGANG TIKET");
  lines.push(
    [
      "Nomor tiket",
      "Nomor order",
      "Nama",
      "Email",
      "Telepon",
      "NIK",
      "Jenis tiket",
      "Area",
      "Kursi",
      "Status tiket",
      "Harga satuan",
      "Total order",
      "Refund order",
    ].join(","),
  );
  for (const h of report.holders) {
    lines.push(
      [
        h.ticketNumber,
        h.orderNumber,
        h.holderName,
        h.holderEmail,
        h.holderPhone,
        h.holderIdentityNumber,
        h.ticketTypeName,
        h.sectionName,
        h.seatLabel,
        ticketStatusLabel(h.ticketStatus),
        money(h.unitPriceRupiah),
        money(h.orderPayableRupiah),
        money(h.orderRefundedRupiah),
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

export function organizerPayoutReportHref(eventId: string, format: "pdf" | "csv"): string {
  return `/api/organizer/events/${encodeURIComponent(eventId)}/payout-report?format=${format}`;
}

export function adminPayoutReportHref(payoutId: string, format: "pdf" | "csv"): string {
  return `/api/admin/payouts/${encodeURIComponent(payoutId)}/report?format=${format}`;
}
