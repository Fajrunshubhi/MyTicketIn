import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/guard";
import { lifeDto, listPendingLifecycle } from "@/lib/server/lifecycle";

export const GET = routeHandler(async (req: NextRequest) => {
  await requireAdmin(req);
  const items = (await listPendingLifecycle()).map(lifeDto);
  return jsonData({ items }, 200, req);
});
