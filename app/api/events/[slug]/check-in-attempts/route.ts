import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/guard";
import { listAttempts } from "@/lib/server/checkin";

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const user = await requireAuth(req);
    const items = await listAttempts(user, params.slug, Number(req.nextUrl.searchParams.get("limit") || 50));
    return jsonData({ items, nextCursor: null }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
