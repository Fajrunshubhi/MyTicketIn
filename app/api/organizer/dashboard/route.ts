import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireOrganizerProfile } from "@/lib/server/guard";
import { organizerDashboard } from "@/lib/server/reporting";

export const GET = routeHandler(async (req: NextRequest) => {
  const { organizerProfileId } = await requireOrganizerProfile(req);
  const q = req.nextUrl.searchParams;
  return jsonData(
    await organizerDashboard(organizerProfileId, q.get("eventId") || "", q.get("from") || "", q.get("to") || ""),
    200,
    req,
  );
});
