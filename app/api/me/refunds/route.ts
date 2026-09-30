import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/guard";
import { listBuyerEligibleOrders, listBuyerRefunds } from "@/lib/server/refunds";
import { REFUND_BANKS } from "@/lib/server/refund-policy";

export const GET = routeHandler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const items = await listBuyerRefunds(user.id, 50);
  const eligibleOrders = await listBuyerEligibleOrders(user.id);
  return jsonData({ items, eligibleOrders, banks: REFUND_BANKS, sandbox: true }, 200, req);
});
