import { NextRequest } from "next/server";
import { getPublicEvent } from "@/lib/server/catalog";
import { AppError, correlationId, jsonError, jsonPublic } from "@/lib/server/http";

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const event = await getPublicEvent(params.slug);
    if (!event) {
      throw new AppError("NOT_FOUND", "Event tidak ditemukan.", {}, 404);
    }
    return jsonPublic({ data: { event }, correlationId: correlationId(req) }, 60, 300, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
