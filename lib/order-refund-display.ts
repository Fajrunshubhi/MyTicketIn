export type RefundSnippet = {
  amountRupiah: number;
  status: string;
  source?: string;
  refundNumber?: string;
  reason?: string;
};

export type OrderDocumentKind = "pending" | "paid" | "cancelled" | "refunded" | "expired" | "failed";

const OPEN_REFUND = new Set(["REQUESTED", "APPROVED", "PROCESSING"]);

export function completedRefunds(refunds: RefundSnippet[] | undefined): RefundSnippet[] {
  return (refunds || []).filter((item) => item.status === "COMPLETED");
}

export function completedRefundTotal(refunds: RefundSnippet[] | undefined): number {
  return completedRefunds(refunds).reduce((sum, item) => sum + Math.max(0, Math.trunc(item.amountRupiah || 0)), 0);
}

export function hasOpenRefundRequest(refunds: RefundSnippet[] | undefined): boolean {
  return (refunds || []).some((item) => OPEN_REFUND.has(item.status));
}

/** Pembatalan pembeli/event membatalkan tiket Unused meski order tetap PAID (refund 75%). */
export function ticketsCancelledByRefund(
  orderStatus: string,
  refunds: RefundSnippet[] | undefined,
): boolean {
  if (orderStatus === "REFUNDED" || orderStatus === "CANCELLED") return true;
  return (refunds || []).some((item) => {
    if (item.source !== "BUYER" && item.source !== "EVENT_CANCELLED") return false;
    return item.status === "APPROVED" || item.status === "PROCESSING" || item.status === "COMPLETED";
  });
}

export function orderDocumentKind(
  orderStatus: string,
  refunds?: RefundSnippet[],
  ticketsCancelled = false,
): OrderDocumentKind {
  if (orderStatus === "PENDING") return "pending";
  if (orderStatus === "EXPIRED") return "expired";
  if (orderStatus === "FAILED") return "failed";
  if (orderStatus === "REFUNDED") return "refunded";
  if (orderStatus === "CANCELLED" || ticketsCancelled || ticketsCancelledByRefund(orderStatus, refunds)) {
    return "cancelled";
  }
  if (orderStatus === "PAID") return "paid";
  return "pending";
}

export function orderDocumentTitle(kind: OrderDocumentKind): string {
  if (kind === "cancelled") return "DOKUMEN PEMBATALAN";
  if (kind === "refunded") return "DOKUMEN REFUND";
  if (kind === "paid") return "BUKTI PEMBAYARAN";
  return "RINGKASAN ORDER";
}

export function orderStampLabel(kind: OrderDocumentKind): string {
  if (kind === "paid") return "LUNAS";
  if (kind === "cancelled") return "DIBATALKAN";
  if (kind === "refunded") return "DIREFUND";
  if (kind === "pending") return "BELUM LUNAS";
  if (kind === "expired") return "KEDALUWARSA";
  return "GAGAL";
}

export function orderStatusUiLabel(kind: OrderDocumentKind): string {
  if (kind === "paid") return "Lunas";
  if (kind === "cancelled") return "Dibatalkan";
  if (kind === "refunded") return "Direfund";
  if (kind === "pending") return "Menunggu pembayaran";
  if (kind === "expired") return "Kedaluwarsa";
  return "Gagal";
}

export function refundStatusUiLabel(status: string): string {
  if (status === "REQUESTED") return "Menunggu keputusan";
  if (status === "APPROVED") return "Disetujui · menunggu transfer";
  if (status === "REJECTED") return "Ditolak";
  if (status === "PROCESSING") return "Transfer diproses";
  if (status === "COMPLETED") return "Selesai";
  if (status === "FAILED") return "Gagal";
  return status;
}

export type RefundTimelineStep = {
  id: string;
  label: string;
  detail?: string;
  state: "done" | "current" | "wait" | "error";
};

export function refundTimeline(input: {
  status: string;
  source?: string;
  requestedAt?: string | null;
  decidedAt?: string | null;
  transferDueAt?: string | null;
  transferredAt?: string | null;
  completedAt?: string | null;
  decisionReason?: string | null;
}): RefundTimelineStep[] {
  const status = input.status;
  const rejected = status === "REJECTED";
  const approved = status === "APPROVED" || status === "PROCESSING" || status === "COMPLETED";
  const transferring = status === "APPROVED" || status === "PROCESSING";
  const done = status === "COMPLETED";
  return [
    {
      id: "submit",
      label: "Diajukan",
      detail: "Pengajuan dan rekening diterima.",
      state: "done",
    },
    {
      id: "review",
      label: "Dicek penyelenggara",
      detail: status === "REQUESTED" ? "Menunggu keputusan." : "Sudah diperiksa.",
      state: status === "REQUESTED" ? "current" : "done",
    },
    {
      id: "decision",
      label: rejected ? "Ditolak" : "Disetujui",
      detail: rejected ? input.decisionReason || "Lihat alasan penyelenggara." : "Tiket tidak berlaku. Transfer sandbox menyusul.",
      state: rejected ? "error" : approved ? "done" : "wait",
    },
    {
      id: "transfer",
      label: "Menunggu transfer",
      detail: done
        ? "Bukti transfer sudah diunggah."
        : transferring
          ? "Penyelenggara boleh menahan transfer maksimal 1×24 jam."
          : rejected
            ? "Tidak dilanjutkan."
            : "Setelah disetujui, maksimal 24 jam.",
      state: done ? "done" : transferring ? "current" : rejected ? "wait" : "wait",
    },
    {
      id: "complete",
      label: "Selesai",
      detail: done ? "Refund sandbox selesai. Bukan uang nyata." : "Menunggu bukti transfer.",
      state: done ? "done" : "wait",
    },
  ];
}

export function refundSourceUiLabel(source?: string): string {
  if (source === "BUYER") return "Pembatalan pembeli (75%)";
  if (source === "EVENT_CANCELLED") return "Pembatalan event (100% sisa)";
  if (source === "ADMIN") return "Catatan admin";
  return source || "";
}

/** Tokopedia-style seller review window; admin only escalates after this. */
export const ORGANIZER_REVIEW_SLA_HOURS = 48;

export type RefundOversightFlag = "stale_review" | "transfer_overdue" | null;

export function refundOversightFlag(input: {
  status: string;
  requestedAt?: string | null;
  transferDueAt?: string | null;
  nowMs?: number;
}): RefundOversightFlag {
  const now = input.nowMs ?? Date.now();
  if (input.status === "REQUESTED" && input.requestedAt) {
    const age = now - new Date(input.requestedAt).getTime();
    if (Number.isFinite(age) && age >= ORGANIZER_REVIEW_SLA_HOURS * 3600_000) return "stale_review";
  }
  if ((input.status === "APPROVED" || input.status === "PROCESSING") && input.transferDueAt) {
    const due = new Date(input.transferDueAt).getTime();
    if (Number.isFinite(due) && due <= now) return "transfer_overdue";
  }
  return null;
}

export function refundOversightLabel(flag: RefundOversightFlag): string {
  if (flag === "stale_review") return "SLA tinjauan terlampaui (48 jam)";
  if (flag === "transfer_overdue") return "Transfer 24 jam terlampaui";
  return "";
}
