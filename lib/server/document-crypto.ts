import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "@/lib/server/http";

/** 32-byte key as 64 hex chars or base64. No fallback: identity documents must never be sealed with a guessable key. */
function documentKey(): Buffer {
  const raw = String(process.env.DOCUMENT_ENCRYPTION_KEY || "").trim();
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  const decoded = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (decoded.length === 32) return decoded;
  throw new AppError("SERVICE_UNHEALTHY", "Penyimpanan dokumen belum dikonfigurasi.", {}, 503);
}

export type SealedDocument = { nonce: Buffer; tag: Buffer; ciphertext: Buffer };

/** The AAD binds the ciphertext to its owner and kind so a row cannot be swapped between profiles. */
export function sealDocument(bytes: Buffer, aad: string): SealedDocument {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", documentKey(), nonce);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return { nonce, tag: cipher.getAuthTag(), ciphertext };
}

export function openDocument(sealed: SealedDocument, aad: string): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", documentKey(), sealed.nonce);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(sealed.tag);
  return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
}
