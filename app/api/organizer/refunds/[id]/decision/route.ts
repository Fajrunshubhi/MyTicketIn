import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { readJson, requireMutating, requireOrganizerProfile } from "@/lib/server/guard";
import { decideOrganizerRefund } from "@/lib/server/refunds";

export const POST = routeHandler(async (req: NextRequest, ctx) => {
  requireMutating(req);
  const { user, organizerProfileId } = await requireOrganizerProfile(req);
  const body = await readJson<{ decision?: string; reason?: string }>(req);
  const refund = await decideOrganizerRefund(
    user.id,
    organizerProfileId,
    String(ctx.params?.id || ""),
    String(body.decision || ""),
    String(body.reason || ""),
  );
  return jsonData({ refund }, 200, req);
});
