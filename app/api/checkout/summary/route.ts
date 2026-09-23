import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { readJson, requireBuyer, requireMutating } from "@/lib/server/guard";
import { summarize } from "@/lib/server/orders";

export const POST = routeHandler(async (req: NextRequest) => {
  requireMutating(req);
  const user = await requireBuyer(req);
  const body = await readJson<{ eventId: string; items?: { ticketTypeId: string; quantity: number }[] }>(req);
  const out = await summarize(user, body);
  return jsonData(out, 200, req);
});
