import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireScheduler } from "@/lib/server/guard";
import { dispatchNotificationOutbox } from "@/lib/server/notifications";

export const POST = routeHandler(async (req: NextRequest) => {
  requireScheduler(req);
  const body = (await req.json().catch(() => ({}))) as { batchSize?: number };
  return jsonData(await dispatchNotificationOutbox(Number(body.batchSize || 50)), 200, req);
});
