import { afterEach, describe, expect, it } from "vitest";
import {
  activePaymentProvider,
  classifyMidtransServerKey,
  midtransHosts,
  midtransMode,
  mapMidtransStatus,
  midtransSignature,
  parseGrossAmount,
  parseMidtransNotification,
  chargeCatalog,
  midtransRefundApiSupported,
  parseQrisCharge,
  parseVaCharge,
  parseMidtransRefundResponse,
  verifyMidtransSignature,
} from "@/lib/server/midtrans";

const KEY = "SB-Mid-server-unit-test-key";
const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("parseGrossAmount", () => {
  it("accepts integer Rupiah with optional .00", () => {
    expect(parseGrossAmount("50000")).toBe(50000);
    expect(parseGrossAmount("50000.00")).toBe(50000);
  });
  it("rejects fractions, negatives, and junk", () => {
    expect(parseGrossAmount("50000.50")).toBeNull();
    expect(parseGrossAmount("-1")).toBeNull();
    expect(parseGrossAmount("1e5")).toBeNull();
    expect(parseGrossAmount("")).toBeNull();
  });
});

describe("mapMidtransStatus", () => {
  it.each([
    ["settlement", "", "payment.succeeded"],
    ["capture", "accept", "payment.succeeded"],
    ["capture", "challenge", "payment.pending"],
    ["capture", "deny", "payment.failed"],
    ["pending", "", "payment.pending"],
    ["deny", "", "payment.failed"],
    ["cancel", "", "payment.failed"],
    ["failure", "", "payment.failed"],
    ["expire", "", "payment.expired"],
    ["refund", "", "refund.completed"],
    ["partial_refund", "", "refund.completed"],
    ["chargeback", "", "provider.recorded"],
  ])("%s/%s -> %s", (status, fraud, expected) => {
    expect(mapMidtransStatus(status, fraud)).toBe(expected);
  });
});

describe("notification signature", () => {
  const base = { order_id: "mti-abc", status_code: "200", gross_amount: "50000.00" };
  it("verifies SHA512(order_id+status_code+gross_amount+ServerKey)", () => {
    process.env.MIDTRANS_SERVER_KEY = KEY;
    const sig = midtransSignature(base.order_id, base.status_code, base.gross_amount, KEY);
    const n = parseMidtransNotification(JSON.stringify({ ...base, signature_key: sig, transaction_status: "settlement" }));
    expect(n).not.toBeNull();
    expect(verifyMidtransSignature(n!)).toBe(true);
  });
  it("rejects a tampered amount", () => {
    process.env.MIDTRANS_SERVER_KEY = KEY;
    const sig = midtransSignature(base.order_id, base.status_code, base.gross_amount, KEY);
    const n = parseMidtransNotification(
      JSON.stringify({ ...base, gross_amount: "1.00", signature_key: sig, transaction_status: "settlement" }),
    );
    expect(verifyMidtransSignature(n!)).toBe(false);
  });
  it("refuses production-style server keys", () => {
    process.env.MIDTRANS_SERVER_KEY = "Mid-server-prod";
    const n = parseMidtransNotification(
      JSON.stringify({ ...base, signature_key: "00", transaction_status: "settlement" }),
    );
    expect(() => verifyMidtransSignature(n!)).toThrow(/Production/);
  });
  it("rejects malformed bodies", () => {
    expect(parseMidtransNotification("not json")).toBeNull();
    expect(parseMidtransNotification(JSON.stringify({ order_id: "x" }))).toBeNull();
  });
});

describe("chargeCatalog", () => {
  it("keeps ticket lines when they sum to the payable amount", () => {
    const out = chargeCatalog({
      customerName: "Ahmad Budi",
      customerEmail: "ahmad@example.com",
      amountRupiah: 150000,
      items: [
        { id: "tt1", name: "VIP", price: 75000, quantity: 2 },
      ],
    });
    expect(out.customer_details).toEqual({ first_name: "Ahmad Budi", email: "ahmad@example.com" });
    expect(out.item_details).toEqual([{ id: "tt1", name: "VIP", price: 75000, quantity: 2 }]);
  });

  it("collapses to one line when discounts make the lines not match", () => {
    const out = chargeCatalog({
      customerName: "Ahmad",
      customerEmail: "bukan-email",
      amountRupiah: 100000,
      items: [{ id: "tt1", name: "VIP", price: 75000, quantity: 2 }],
    });
    expect(out.customer_details).toEqual({ first_name: "Ahmad" });
    expect(out.item_details).toEqual([{ id: "order", name: "Tiket", price: 100000, quantity: 1 }]);
  });
});

describe("parseQrisCharge / parseVaCharge", () => {
  it("reads the ASPI QR image and drops unknown hosts", () => {
    const ok = parseQrisCharge({
      qr_string: "000201sandbox",
      actions: [
        { name: "generate-qr-code", url: "https://evil.example/v2/qris/x/qr-code" },
        { name: "generate-qr-code-v2", url: "https://api.sandbox.midtrans.com/v4/qris/abc/qr-code" },
      ],
    });
    expect(ok?.qrString).toBe("000201sandbox");
    expect(ok?.qrImageUrl).toContain("/v4/qris/abc/qr-code");
    expect(parseQrisCharge({ actions: [] })).toBeNull();
  });

  it("builds the sandbox image URL from transaction_id when actions are missing", () => {
    process.env.PAYMENT_ENV = "sandbox";
    const ok = parseQrisCharge({
      qr_string: "000201sandbox",
      transaction_id: "021e14c5-4e1a-49f6-ad95-7bc5c400b637",
    });
    expect(ok?.qrImageUrl).toBe(
      "https://api.sandbox.midtrans.com/v2/qris/021e14c5-4e1a-49f6-ad95-7bc5c400b637/qr-code",
    );
    expect(ok?.copyText).toBe(ok?.qrImageUrl);
  });

  it("reads BCA VA numbers, Permata, and Mandiri bill key", () => {
    expect(
      parseVaCharge({ va_numbers: [{ bank: "bca", va_number: "1234567890123" }] }, "BCA")?.vaNumber,
    ).toBe("1234567890123");
    expect(parseVaCharge({ permata_va_number: "821000111" }, "PERMATA")?.copyText).toBe("821000111");
    const mandiri = parseVaCharge({ biller_code: "70012", bill_key: "99001122" }, "MANDIRI");
    expect(mandiri?.billerCode).toBe("70012");
    expect(mandiri?.copyText).toBe("99001122");
  });
});

describe("classifyMidtransServerKey", () => {
  it("accepts only sandbox server keys", () => {
    expect(classifyMidtransServerKey("SB-Mid-server-abc")).toBe("sandbox-server");
    expect(classifyMidtransServerKey("SB-Mid-client-abc")).toBe("sandbox-client");
    expect(classifyMidtransServerKey("Mid-server-abc")).toBe("production");
    expect(classifyMidtransServerKey("Mid-client-abc")).toBe("production-client");
    expect(classifyMidtransServerKey("")).toBe("missing");
  });
});

describe("midtransMode", () => {
  it("stays on sandbox hosts unless PAYMENT_ENV=production", () => {
    delete process.env.PAYMENT_ENV;
    expect(midtransMode()).toBe("sandbox");
    expect(midtransHosts().api).toContain("api.sandbox.midtrans.com");
    process.env.PAYMENT_ENV = "production";
    expect(midtransHosts().charge).toBe("https://api.midtrans.com/v2/charge");
    process.env.PAYMENT_ENV = "live";
    expect(() => midtransMode()).toThrow();
  });
});

describe("midtransRefundApiSupported", () => {
  it("allows QRIS and e-wallet, not virtual account", () => {
    expect(midtransRefundApiSupported("QRIS")).toBe(true);
    expect(midtransRefundApiSupported("EWALLET")).toBe(true);
    expect(midtransRefundApiSupported("VIRTUAL_ACCOUNT")).toBe(false);
  });
});

describe("parseMidtransRefundResponse", () => {
  it("accepts 200/201 and treats 406 as a duplicate success", () => {
    expect(parseMidtransRefundResponse({ status_code: "200" }, 200)).toEqual({ ok: true, duplicate: false });
    expect(parseMidtransRefundResponse({ status_code: "406" }, 406)).toEqual({ ok: true, duplicate: true });
    expect(parseMidtransRefundResponse({ status_code: "412" }, 412)).toEqual({ ok: false, duplicate: false });
  });
});

describe("activePaymentProvider", () => {
  it("defaults to sandbox and rejects unknown values", () => {
    delete process.env.PAYMENT_PROVIDER;
    expect(activePaymentProvider()).toBe("sandbox");
    process.env.PAYMENT_PROVIDER = "midtrans";
    expect(activePaymentProvider()).toBe("midtrans");
    process.env.PAYMENT_PROVIDER = "stripe";
    expect(() => activePaymentProvider()).toThrow();
  });
});