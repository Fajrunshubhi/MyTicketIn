import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireScheduler } from "@/lib/server/guard";

export const POST = routeHandler(async (req: NextRequest) => {
  requireScheduler(req);
  return jsonData({ ok: true }, 200, req);
});
