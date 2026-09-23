import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { AppError, jsonError } from "@/lib/server/http";
import { galleryFilePath } from "@/lib/server/gallery";

export async function GET(req: NextRequest, { params }: { params: { name: string } }) {
  try {
    const filePath = galleryFilePath(params.name);
    const bytes = await readFile(filePath);
    const lower = params.name.toLowerCase();
    const type = lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return jsonError(new AppError("NOT_FOUND", "Berkas tidak ditemukan.", {}, 404), req);
    }
    return jsonError(err, req);
  }
}
