import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { AppError, jsonError } from "@/lib/server/http";
import { DUMMY_EVENT_COVER } from "@/lib/event-cover";
import { galleryFilePath, localUploadsAvailable } from "@/lib/server/gallery";

function dummyLocation(): NextResponse {
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: DUMMY_EVENT_COVER,
      "Cache-Control": "public, max-age=300",
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: { name: string } }) {
  try {
    if (!localUploadsAvailable()) {
      return dummyLocation();
    }
    const filePath = galleryFilePath(params.name);
    const bytes = await readFile(filePath);
    const lower = params.name.toLowerCase();
    const type = lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT" || err instanceof AppError) {
      return dummyLocation();
    }
    return jsonError(err, req);
  }
}
