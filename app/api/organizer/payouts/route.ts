import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireOrganizerProfile } from "@/lib/server/guard";
import { listOrganizerPayouts, organizerPayoutOverview } from "@/lib/server/payouts";

export const GET = routeHandler(async (req: NextRequest) => {
  const { organizerProfileId } = await requireOrganizerProfile(req);
  const [overview, items] = await Promise.all([
    organizerPayoutOverview(organizerProfileId),
    listOrganizerPayouts(organizerProfileId),
  ]);
  return jsonData({ ...overview, items }, 200, req);
});
