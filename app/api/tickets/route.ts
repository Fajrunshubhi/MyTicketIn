import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/guard";
import { listTickets } from "@/lib/server/tickets";

export const GET = routeHandler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const items = await listTickets(user, req.nextUrl.searchParams.get("status") || "", Number(req.nextUrl.searchParams.get("limit") || 20));
  return jsonData({ items, nextCursor: null }, 200, req);
});
