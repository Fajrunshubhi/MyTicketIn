import { afterEach, describe, expect, it } from "vitest";
import {
  activePaymentProvider,
  mapMidtransStatus,
  midtransSignature,
  parseGrossAmount,
  parseMidtransNotification,
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
    ["refund", "", "provider.recorded"],
    ["partial_refund", "", "provider.recorded"],
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
    expect(() => verifyMidtransSignature(n!)).toThrow();
  });
  it("rejects malformed bodies", () => {
    expect(parseMidtransNotification("not json")).toBeNull();
    expect(parseMidtransNotification(JSON.stringify({ order_id: "x" }))).toBeNull();
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
