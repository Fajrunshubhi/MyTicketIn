import { describe, expect, it } from "vitest";
import {
  completedRefundTotal,
  orderDocumentKind,
  orderDocumentTitle,
  orderStampLabel,
  refundOversightFlag,
  ticketsCancelledByRefund,
} from "./order-refund-display";

describe("order refund display", () => {
  it("keeps a paid order as paid until a buyer/event refund completes", () => {
    expect(orderDocumentKind("PAID", [])).toBe("paid");
    expect(orderStampLabel("paid")).toBe("LUNAS");
    expect(orderDocumentTitle("paid")).toBe("BUKTI PEMBAYARAN");
  });

  it("treats completed buyer 75% refund as cancelled tickets, not LUNAS", () => {
    const refunds = [{ amountRupiah: 375000, status: "COMPLETED", source: "BUYER" }];
    expect(ticketsCancelledByRefund("PAID", refunds)).toBe(true);
    expect(orderDocumentKind("PAID", refunds)).toBe("cancelled");
    expect(orderStampLabel("cancelled")).toBe("DIBATALKAN");
    expect(orderDocumentTitle("cancelled")).toBe("DOKUMEN PEMBATALAN");
    expect(completedRefundTotal(refunds)).toBe(375000);
  });

  it("labels a fully refunded order as DIREFUND", () => {
    expect(orderDocumentKind("REFUNDED", [{ amountRupiah: 500000, status: "COMPLETED", source: "EVENT_CANCELLED" }])).toBe(
      "refunded",
    );
    expect(orderStampLabel("refunded")).toBe("DIREFUND");
  });

  it("cancels tickets when a buyer refund is approved, before transfer proof", () => {
    expect(ticketsCancelledByRefund("PAID", [{ amountRupiah: 1, status: "APPROVED", source: "BUYER" }])).toBe(true);
    expect(ticketsCancelledByRefund("PAID", [{ amountRupiah: 1, status: "REQUESTED", source: "BUYER" }])).toBe(false);
  });

  it("flags organizer SLA breaches for platform oversight", () => {
    const now = Date.parse("2026-10-01T00:00:00.000Z");
    expect(
      refundOversightFlag({
        status: "REQUESTED",
        requestedAt: "2026-09-28T00:00:00.000Z",
        nowMs: now,
      }),
    ).toBe("stale_review");
    expect(
      refundOversightFlag({
        status: "APPROVED",
        transferDueAt: "2026-09-30T00:00:00.000Z",
        nowMs: now,
      }),
    ).toBe("transfer_overdue");
    expect(
      refundOversightFlag({
        status: "REQUESTED",
        requestedAt: "2026-09-30T12:00:00.000Z",
        nowMs: now,
      }),
    ).toBe(null);
  });
});
