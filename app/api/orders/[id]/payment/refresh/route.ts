import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireAuth, requireMutating } from "@/lib/server/guard";
import { hitRateLimit } from "@/lib/server/rate-limit";
import { refreshPayment } from "@/lib/server/payments";

export const POST = routeHandler(async (req: NextRequest, ctx) => {
  requireMutating(req);
  const user = await requireAuth(req);
  // Each refresh calls the provider, so keep it per-buyer bounded.
  await hitRateLimit("create-payment", `refresh:${user.id}`, 20, 60);
  const payment = await refreshPayment(user, String(ctx.params?.id || ""));
  return jsonData({ payment }, 200, req);
});
