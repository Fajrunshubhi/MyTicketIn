import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/guard";
import { loyaltyOverview } from "@/lib/server/orders";

export const GET = routeHandler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  return jsonData(await loyaltyOverview(user), 200, req);
});
