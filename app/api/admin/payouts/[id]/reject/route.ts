import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { readJson, requireAdmin, requireMutating } from "@/lib/server/guard";
import { rejectPayout } from "@/lib/server/payouts";

export const POST = routeHandler(async (req: NextRequest, ctx) => {
  requireMutating(req);
  const admin = await requireAdmin(req);
  const body = await readJson<{ reason?: string }>(req);
  const payout = await rejectPayout(admin.id, String(ctx.params?.id || ""), String(body.reason || ""));
  return jsonData({ payout }, 200, req);
});
