import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireScheduler } from "@/lib/server/guard";
import { expireDue } from "@/lib/server/orders";

export const POST = routeHandler(async (req: NextRequest) => {
  requireScheduler(req);
  const body = (await req.json().catch(() => ({}))) as { batchSize?: number };
  return jsonData(await expireDue(Number(body.batchSize || 20)), 200, req);
});
