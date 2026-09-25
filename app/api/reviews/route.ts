import { NextRequest } from "next/server";
import { correlationId, jsonPublic, routeHandler } from "@/lib/server/http";
import { listRecentReviews } from "@/lib/server/reviews";

export const GET = routeHandler(async (req: NextRequest) => {
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 12;
  const items = await listRecentReviews(Number.isInteger(limit) ? limit : 12);
  return jsonPublic({ data: { items }, correlationId: correlationId(req) }, 30, 120, req);
});
