import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireBuyer } from "@/lib/server/guard";
import { getBuyerDashboard } from "@/lib/server/buyer-dashboard";

export const GET = routeHandler(async (req: NextRequest) => {
  const user = await requireBuyer(req);
  return jsonData(await getBuyerDashboard(user), 200, req);
});
