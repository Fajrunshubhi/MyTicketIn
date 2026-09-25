import { describe, expect, it } from "vitest";
import { buildOrderReceiptLines, buildOrderReceiptPdfBytes, type ReceiptOrder } from "@/lib/order-receipt-pdf";

const base: ReceiptOrder = {
  orderNumber: "MTI-ABCDEF1234",
  status: "PAID",
  createdAt: "2026-09-26T08:00:00.000Z",
  subtotalRupiah: 200000,
  redeemedPoints: 0,
  loyaltyDiscountRupiah: 0,
  totalPayableRupiah: 200000,
  event: {
    title: "Konser Uji",
    venueName: "GBK",
    city: "Jakarta",
    startsAt: "2026-10-01T12:00:00.000Z",
    timezone: "Asia/Jakarta",
  },
  items: [
    {
      name: "VIP",
      quantity: 1,
      unitPriceRupiah: 200000,
      lineTotalRupiah: 200000,
      attendees: [{ fullName: "Andi Pembeli", email: "andi@example.com", identityNumber: "3171010101010001" }],
    },
  ],
};

describe("buildOrderReceiptLines", () => {
  it("labels paid orders as payment proof and masks NIK", () => {
    const lines = buildOrderReceiptLines(base, "QRIS").join("\n");
    expect(lines).toContain("BUKTI PEMBAYARAN");
    expect(lines).toContain("MTI-ABCDEF1234");
    expect(lines).toContain("Metode bayar   : QRIS");
    expect(lines).toContain("VIP");
    expect(lines).toContain("Andi Pembeli");
    expect(lines).toContain("NIK xxxxxxxxxxxx0001");
    expect(lines).not.toContain("3171010101010001");
    expect(lines).toContain("TOTAL DIBAYAR");
  });

  it("writes a letterhead PDF with table, stamp, and masked NIK", () => {
    const bytes = buildOrderReceiptPdfBytes(base, "QRIS");
    const raw = new TextDecoder("latin1").decode(bytes);
    expect(raw.startsWith("%PDF-1.4")).toBe(true);
    expect(raw).toContain("MYTICKETIN");
    expect(raw).toContain("BUKTI PEMBAYARAN");
    expect(raw).toContain("LUNAS");
    expect(raw).toContain("DESKRIPSI");
    expect(raw).toContain("TOTAL DIBAYAR");
    expect(raw).toContain("Helvetica-Bold");
    expect(raw).toContain("Andi Pembeli");
    expect(raw).toContain("NIK xxxxxxxxxxxx0001");
    expect(raw).not.toContain("3171010101010001");
  });

  it("labels unpaid orders as summary, not payment proof", () => {
    const lines = buildOrderReceiptLines({ ...base, status: "PENDING" }).join("\n");
    expect(lines).toContain("RINGKASAN ORDER");
    expect(lines).toContain("Order belum lunas");
    expect(lines).not.toContain("BUKTI PEMBAYARAN");
  });
});
