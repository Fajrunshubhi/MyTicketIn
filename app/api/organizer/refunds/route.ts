import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireOrganizerProfile } from "@/lib/server/guard";
import { listOrganizerRefunds } from "@/lib/server/refunds";

export const GET = routeHandler(async (req: NextRequest) => {
  const { organizerProfileId } = await requireOrganizerProfile(req);
  const items = await listOrganizerRefunds(organizerProfileId, 50);
  return jsonData({ items, sandbox: true }, 200, req);
});
