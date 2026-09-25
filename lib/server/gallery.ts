import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { isLocalGalleryUrl } from "@/lib/event-cover";
import { AppError, execute, newId, query } from "@/lib/server/http";
import { galleryStorageConfig, putGalleryObject } from "@/lib/server/s3-put";

const MAX_BYTES = 5 * 1024 * 1024;

function detectExt(buf: Buffer): { mime: string; ext: string } {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { mime: "image/png", ext: ".png" };
  }
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57 && buf[9] === 0x45) {
    return { mime: "image/webp", ext: ".webp" };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: "image/jpeg", ext: ".jpg" };
  }
  throw new AppError("VALIDATION_ERROR", "Tipe gambar tidak didukung.", {}, 400);
}

function asBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") {
    const hex = value.startsWith("\\x") ? value.slice(2) : value;
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) return Buffer.from(hex, "hex");
  }
  return Buffer.from([]);
}

export function galleryFilePath(name: string): string {
  const base = path.basename(name);
  if (!/^[a-zA-Z0-9]+\.(png|jpg|jpeg|webp)$/i.test(base)) {
    throw new AppError("NOT_FOUND", "Berkas tidak ditemukan.", {}, 404);
  }
  return path.join(process.cwd(), "uploads", "gallery", base);
}

export function localUploadsAvailable(): boolean {
  if (process.env.VERCEL || process.env.VERCEL_ENV) return false;
  return true;
}

export async function saveGalleryFile(bytes: Buffer): Promise<string> {
  if (!bytes.length || bytes.length > MAX_BYTES) {
    throw new AppError("VALIDATION_ERROR", "Ukuran gambar maksimal 5 MB.", {}, 400);
  }
  const { mime, ext } = detectExt(bytes);
  const name = `${newId()}${ext}`;
  const key = `gallery/${name}`;
  if (galleryStorageConfig()) {
    return putGalleryObject(key, bytes, mime);
  }
  await execute(
    `INSERT INTO gallery_files (name, mime_type, byte_size, bytes) VALUES ($1, $2, $3, $4)`,
    [name, mime, bytes.length, bytes],
  );
  if (localUploadsAvailable()) {
    const dir = path.join(process.cwd(), "uploads", "gallery");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), bytes);
  }
  return `/uploads/gallery/${name}`;
}

export async function readGalleryFile(name: string): Promise<{ bytes: Buffer; mime: string } | null> {
  const filePath = galleryFilePath(name);
  const rows = await query<{ mime_type: string; bytes: unknown }>(
    `SELECT mime_type, bytes FROM gallery_files WHERE name = $1 LIMIT 1`,
    [path.basename(filePath)],
  );
  const row = rows[0];
  if (!row) return null;
  const bytes = asBuffer(row.bytes);
  if (!bytes.length) return null;
  return { bytes, mime: String(row.mime_type || "image/jpeg") };
}

/** Gallery URLs are served by the Route Handler from Postgres on Vercel. */
export function publicImageSrc(url: string, fallback: string): string {
  const trimmed = String(url || "").trim();
  if (!trimmed) return fallback;
  if (!isLocalGalleryUrl(trimmed)) return trimmed;
  try {
    galleryFilePath(trimmed.replace(/^.*\/uploads\/gallery\//, ""));
    return trimmed;
  } catch {
    return fallback;
  }
}
