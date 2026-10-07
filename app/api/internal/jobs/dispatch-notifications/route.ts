import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireScheduler } from "@/lib/server/guard";
import { dispatchNotificationOutbox, retryEmailDeliveries } from "@/lib/server/notifications";

export const POST = routeHandler(async (req: NextRequest) => {
  requireScheduler(req);
  const body = (await req.json().catch(() => ({}))) as { batchSize?: number };
  const batch = Number(body.batchSize || 50);
  const inApp = await dispatchNotificationOutbox(batch);
  const email = await retryEmailDeliveries(batch);
  return jsonData({ ...inApp, email }, 200, req);
});
