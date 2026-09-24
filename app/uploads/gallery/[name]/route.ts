import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { AppError, jsonError } from "@/lib/server/http";
import { galleryFilePath, localUploadsAvailable } from "@/lib/server/gallery";

function dummyRedirect(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/dummy-events/jazz-1.jpg";
  url.search = "";
  return NextResponse.redirect(url, 307);
}

export async function GET(req: NextRequest, { params }: { params: { name: string } }) {
  try {
    if (!localUploadsAvailable()) {
      return dummyRedirect(req);
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
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return dummyRedirect(req);
    }
    return jsonError(err instanceof AppError ? err : err, req);
  }
}
