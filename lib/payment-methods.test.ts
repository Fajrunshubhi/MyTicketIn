import { describe, expect, it } from "vitest";
import {
  allowQrImageUrl,
  midtransSimulatorUrl,
  parsePaymentMethod,
  parseVaBank,
  sandboxVaNumber,
  sanitizePaymentInstructions,
} from "@/lib/payment-methods";

describe("parsePaymentMethod / parseVaBank", () => {
  it("accepts the three RFC methods and five VA banks", () => {
    expect(parsePaymentMethod("qris")).toBe("QRIS");
    expect(parsePaymentMethod("VIRTUAL_ACCOUNT")).toBe("VIRTUAL_ACCOUNT");
    expect(parsePaymentMethod("card")).toBeNull();
    expect(parseVaBank("bca")).toBe("BCA");
    expect(parseVaBank("MANDIRI")).toBe("MANDIRI");
    expect(parseVaBank("BSI")).toBeNull();
  });
});

describe("allowQrImageUrl", () => {
  it("allows only Midtrans HTTPS QR paths", () => {
    expect(allowQrImageUrl("https://api.sandbox.midtrans.com/v2/qris/abc/qr-code")).toBe(true);
    expect(allowQrImageUrl("https://api.midtrans.com/v4/qris/abc/qr-code")).toBe(true);
    expect(allowQrImageUrl("https://evil.example/v2/qris/abc/qr-code")).toBe(false);
    expect(allowQrImageUrl("https://api.sandbox.midtrans.com/v2/charge")).toBe(false);
  });
});

describe("sanitizePaymentInstructions", () => {
  it("drops Snap tokens and unknown keys", () => {
    const out = sanitizePaymentInstructions({
      kind: "QRIS",
      qrString: "payload",
      snapToken: "secret",
      raw: { foo: 1 },
    });
    expect(out).toEqual({
      kind: "QRIS",
      qrString: "payload",
      qrImageUrl: undefined,
      copyText: "payload",
      simulatorHint: undefined,
      simulatorUrl: undefined,
    });
    expect(JSON.stringify(out)).not.toContain("secret");
  });

  it("keeps a sandbox Snap redirect only on the sandbox host", () => {
    const ok = sanitizePaymentInstructions({
      kind: "EWALLET",
      redirectUrl: "https://app.sandbox.midtrans.com/snap/v4/redirection/tok-1",
    });
    expect(ok?.redirectUrl).toContain("/snap/");
    expect(
      sanitizePaymentInstructions({
        kind: "EWALLET",
        redirectUrl: "https://app.midtrans.com/snap/v4/redirection/tok-1",
      })?.redirectUrl,
    ).toContain("app.midtrans.com/snap/");
    expect(
      sanitizePaymentInstructions({
        kind: "EWALLET",
        redirectUrl: "https://evil.example/snap/v4/redirection/tok-1",
      }),
    ).toBeNull();
  });
});

describe("sandboxVaNumber", () => {
  it("is stable for the same payment and differs by bank", () => {
    const id = "aabbccddeeff00112233445566778899";
    expect(sandboxVaNumber("BCA", id)).toBe(sandboxVaNumber("BCA", id));
    expect(sandboxVaNumber("BCA", id)).not.toBe(sandboxVaNumber("BNI", id));
    expect(sandboxVaNumber("BCA", id)).toMatch(/^70012\d+$/);
  });
});
