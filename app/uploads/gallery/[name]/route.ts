import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { AppError, jsonError } from "@/lib/server/http";
import { DUMMY_EVENT_COVER } from "@/lib/event-cover";
import { galleryFilePath, localUploadsAvailable, readGalleryFile } from "@/lib/server/gallery";

function dummyLocation(): NextResponse {
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: DUMMY_EVENT_COVER,
      "Cache-Control": "public, max-age=300",
    },
  });
}

function imageResponse(bytes: Buffer, mime: string): NextResponse {
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: { name: string } }) {
  try {
    const stored = await readGalleryFile(params.name);
    if (stored) return imageResponse(stored.bytes, stored.mime);
    if (localUploadsAvailable()) {
      const bytes = await readFile(galleryFilePath(params.name));
      const lower = params.name.toLowerCase();
      const type = lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";
      return imageResponse(Buffer.from(bytes), type);
    }
    return dummyLocation();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT" || err instanceof AppError) {
      return dummyLocation();
    }
    return jsonError(err, req);
  }
}
