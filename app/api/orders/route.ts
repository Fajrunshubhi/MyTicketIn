import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { readJson, requireAuth, requireBuyer, requireMutating } from "@/lib/server/guard";
import { createOrder, listOrders } from "@/lib/server/orders";

export const GET = routeHandler(async (req: NextRequest) => {
  const user = await requireBuyer(req);
  const items = await listOrders(user, Number(req.nextUrl.searchParams.get("limit") || 20));
  return jsonData({ items, nextCursor: null }, 200, req);
});

export const POST = routeHandler(async (req: NextRequest) => {
  requireMutating(req);
  const user = await requireBuyer(req);
  const body = await readJson<{
    eventId: string;
    items?: { ticketTypeId: string; quantity: number; attendees?: { fullName?: string; email?: string; phone?: string; identityNumber?: string }[] }[];
    confirmed?: boolean;
    redeemPoints?: number;
  }>(req);
  const { view, replay } = await createOrder(user, body, req.headers.get("idempotency-key") || "");
  return jsonData({ order: view }, replay ? 200 : 201, req);
});
