import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/guard";

export const GET = routeHandler(async (req: NextRequest) => {
  await requireAdmin(req);
  return jsonData({ status: "ok" }, 200, req);
});
