import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookies, requireCsrf, readCookie } from "@/lib/server/cookies";
import { COOKIE_SESSION, routeHandler } from "@/lib/server/http";
import { deleteSession } from "@/lib/server/session";

export const POST = routeHandler(async (req: NextRequest) => {
  requireCsrf(req);
  await deleteSession(readCookie(req, COOKIE_SESSION));
  const res = new NextResponse(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  clearAuthCookies(res);
  return res;
});
