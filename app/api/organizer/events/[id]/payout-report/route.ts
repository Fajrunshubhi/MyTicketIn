import { NextRequest } from "next/server";
import { routeHandler } from "@/lib/server/http";
import { requireOrganizerProfile } from "@/lib/server/guard";
import { hitRateLimit } from "@/lib/server/rate-limit";
import { loadPayoutReport, payoutReportResponse } from "@/lib/server/payout-report";

export const GET = routeHandler(async (req: NextRequest, ctx) => {
  const { user, organizerProfileId } = await requireOrganizerProfile(req);
  await hitRateLimit("organizer", `payout-report:${user.id}`, 30, 3600);
  const eventId = String(ctx.params?.id || "");
  const format = new URL(req.url).searchParams.get("format") || "pdf";
  const report = await loadPayoutReport(eventId, organizerProfileId);
  return payoutReportResponse(report, format);
});
