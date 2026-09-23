import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/guard";
import { listReconciliations } from "@/lib/server/admin-finance";

export const GET = routeHandler(async (req: NextRequest) => {
  await requireAdmin(req);
  const items = await listReconciliations(req.nextUrl.searchParams.get("status") || "OPEN");
  return jsonData({ items, nextCursor: "" }, 200, req);
});
