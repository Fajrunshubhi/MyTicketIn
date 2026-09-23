import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireMutating } from "@/lib/server/guard";
import { markAllRead } from "@/lib/server/notifications";
import { jsonError, routeHandler } from "@/lib/server/http";

export const POST = routeHandler(async (req: NextRequest) => {
  requireMutating(req);
  const user = await requireAuth(req);
  await markAllRead(user);
  return new NextResponse(null, { status: 204 });
});
