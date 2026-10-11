import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireMutating, requireOrganizerProfile } from "@/lib/server/guard";
import { hitRateLimit } from "@/lib/server/rate-limit";
import { withIdempotency } from "@/lib/server/idempotency";
import { requestPayout } from "@/lib/server/payouts";

export const POST = routeHandler(async (req: NextRequest, ctx) => {
  requireMutating(req);
  const { user, organizerProfileId } = await requireOrganizerProfile(req);
  await hitRateLimit("organizer", `payout:${user.id}`, 20, 3600);
  const eventId = String(ctx.params?.id || "");
  // A retry after a lost response replays the created payout instead of failing with "already requested".
  const { value, replay } = await withIdempotency(
    {
      scope: "REQUEST_PAYOUT",
      actorUserId: user.id,
      key: req.headers.get("idempotency-key"),
      request: { eventId },
      resourceType: "OrganizerPayout",
      resourceId: (r) => String((r as { id: string }).id),
    },
    () => requestPayout(user.id, organizerProfileId, eventId),
  );
  return jsonData({ payout: value }, replay ? 200 : 201, req);
});
