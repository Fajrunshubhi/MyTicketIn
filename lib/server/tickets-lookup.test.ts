import { describe, expect, it } from "vitest";
import { asBuffer, decryptToken, encryptToken, normalizeManualCode } from "@/lib/server/tickets";

describe("normalizeManualCode", () => {
  it("strips separators used on ticket cards", () => {
    expect(normalizeManualCode("A594-3CAC-A9C7-78F1")).toBe("A5943CACA9C778F1");
    expect(normalizeManualCode("a5943caca9c778f1")).toBe("A5943CACA9C778F1");
  });
});

describe("ticket QR buffers", () => {
  it("decodes hex and numeric-key objects from the database driver", () => {
    const nonce = Buffer.from("00112233445566778899aabb", "hex");
    expect(asBuffer("\\x00112233445566778899aabb").equals(nonce)).toBe(true);
    expect(asBuffer("00112233445566778899aabb").equals(nonce)).toBe(true);
    expect(asBuffer({ 0: 0x00, 1: 0x11, 2: 0x22 }).equals(Buffer.from([0x00, 0x11, 0x22]))).toBe(true);
  });

  it("round-trips an opaque token", () => {
    const raw = "aa".repeat(32);
    const enc = encryptToken(raw);
    expect(decryptToken(enc.ciphertext, enc.nonce, enc.tag)).toBe(raw);
  });
});
