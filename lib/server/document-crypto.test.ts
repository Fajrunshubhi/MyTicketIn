import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDocument, sealDocument } from "@/lib/server/document-crypto";
import { validateDocument } from "@/lib/server/organizer-documents";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

describe("document-crypto", () => {
  const original = process.env.DOCUMENT_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.DOCUMENT_ENCRYPTION_KEY = "0123456789abcdef".repeat(4);
  });
  afterEach(() => {
    if (original === undefined) delete process.env.DOCUMENT_ENCRYPTION_KEY;
    else process.env.DOCUMENT_ENCRYPTION_KEY = original;
  });

  it("round-trips with the same AAD", () => {
    const sealed = sealDocument(PNG, "organizer-doc:p1:KTP");
    expect(sealed.ciphertext.equals(PNG)).toBe(false);
    expect(openDocument(sealed, "organizer-doc:p1:KTP").equals(PNG)).toBe(true);
  });

  it("rejects a different AAD so a row cannot be swapped to another profile or kind", () => {
    const sealed = sealDocument(PNG, "organizer-doc:p1:KTP");
    expect(() => openDocument(sealed, "organizer-doc:p2:KTP")).toThrow();
    expect(() => openDocument(sealed, "organizer-doc:p1:SELFIE")).toThrow();
  });

  it("rejects tampered ciphertext", () => {
    const sealed = sealDocument(PNG, "a");
    sealed.ciphertext[0] ^= 0xff;
    expect(() => openDocument(sealed, "a")).toThrow();
  });

  it("fails fast without a key", () => {
    delete process.env.DOCUMENT_ENCRYPTION_KEY;
    expect(() => sealDocument(PNG, "a")).toThrow();
  });
});

describe("validateDocument", () => {
  it("accepts a real image and reports its MIME from magic bytes", () => {
    expect(validateDocument("KTP", PNG).mime).toBe("image/png");
  });
  it("rejects empty, non-image, and oversized input with a field error", () => {
    expect(() => validateDocument("KTP", Buffer.alloc(0))).toThrow();
    expect(() => validateDocument("SELFIE", Buffer.from("not an image at all"))).toThrow();
    expect(() => validateDocument("KTP", Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]))).toThrow();
  });
});
