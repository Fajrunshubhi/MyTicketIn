import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireScheduler } from "@/lib/server/guard";
import { recoverPaidOrders } from "@/lib/server/payments";
import { reconcileTicketIssuance } from "@/lib/server/tickets";

export const POST = routeHandler(async (req: NextRequest) => {
  requireScheduler(req);
  const body = (await req.json().catch(() => ({}))) as { batchSize?: number };
  const batch = Number(body.batchSize || 20);
  // Recover half-finished PAID orders first so ticket reconciliation sees a consistent state.
  const paid = await recoverPaidOrders(batch);
  const tickets = await reconcileTicketIssuance(batch);
  return jsonData({ ...tickets, recoveredPaidOrders: paid.recovered }, 200, req);
});
