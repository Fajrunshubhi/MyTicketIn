import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireAuth, requireMutating } from "@/lib/server/guard";
import { revokeAllSessions } from "@/lib/server/session";
import { clearAuthCookies } from "@/lib/server/cookies";
import { NextResponse } from "next/server";

export const POST = routeHandler(async (req: NextRequest) => {
  requireMutating(req);
  const user = await requireAuth(req);
  await revokeAllSessions(user);
  const res = new NextResponse(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  clearAuthCookies(res);
  return res;
});
