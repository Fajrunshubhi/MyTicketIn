import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireScheduler } from "@/lib/server/guard";
import { reconcileTicketIssuance } from "@/lib/server/tickets";

export const POST = routeHandler(async (req: NextRequest) => {
  requireScheduler(req);
  const body = (await req.json().catch(() => ({}))) as { batchSize?: number };
  return jsonData(await reconcileTicketIssuance(Number(body.batchSize || 20)), 200, req);
});
