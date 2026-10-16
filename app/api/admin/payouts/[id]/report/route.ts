import { NextRequest } from "next/server";
import { routeHandler } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/guard";
import { loadPayoutReportByPayoutId, payoutReportResponse } from "@/lib/server/payout-report";

export const GET = routeHandler(async (req: NextRequest, ctx) => {
  await requireAdmin(req);
  const payoutId = String(ctx.params?.id || "");
  const format = new URL(req.url).searchParams.get("format") || "pdf";
  const report = await loadPayoutReportByPayoutId(payoutId);
  return payoutReportResponse(report, format);
});
