import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { AppError, newId } from "@/lib/server/http";

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

export async function saveGalleryFile(bytes: Buffer): Promise<string> {
  if (!localUploadsAvailable()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Unggah galeri tidak tersedia di Vercel. Gunakan foto dummy atau jalankan secara lokal.",
      {},
      400,
    );
  }
  if (!bytes.length || bytes.length > MAX_BYTES) {
    throw new AppError("VALIDATION_ERROR", "Ukuran gambar maksimal 5 MB.", {}, 400);
  }
  const { ext } = detectExt(bytes);
  const name = `${newId()}${ext}`;
  const dir = path.join(process.cwd(), "uploads", "gallery");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
  return `/uploads/gallery/${name}`;
}

export function galleryFilePath(name: string): string {
  const base = path.basename(name);
  if (!/^[a-zA-Z0-9]+\.(png|jpg|jpeg|webp)$/i.test(base)) {
    throw new AppError("NOT_FOUND", "Berkas tidak ditemukan.", {}, 404);
  }
  return path.join(process.cwd(), "uploads", "gallery", base);
}

export function localUploadsAvailable(): boolean {
  return process.env.VERCEL !== "1";
}

/** Local gallery files live on disk; skip URLs whose file is gone so the UI never shows a broken image. */
export function publicImageSrc(url: string, fallback: string): string {
  const trimmed = String(url || "").trim();
  if (!trimmed) return fallback;
  if (!trimmed.startsWith("/uploads/gallery/")) return trimmed;
  if (!localUploadsAvailable()) return fallback;
  try {
    const filePath = galleryFilePath(trimmed.slice("/uploads/gallery/".length));
    return existsSync(filePath) ? trimmed : fallback;
  } catch {
    return fallback;
  }
}
