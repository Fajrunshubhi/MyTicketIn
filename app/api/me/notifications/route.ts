import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/guard";
import { listNotifications } from "@/lib/server/notifications";

export const GET = routeHandler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const items = await listNotifications(user, Number(req.nextUrl.searchParams.get("limit") || 20));
  return jsonData({ items }, 200, req);
});
