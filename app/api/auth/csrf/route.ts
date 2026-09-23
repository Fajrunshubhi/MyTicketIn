import { NextRequest } from "next/server";
import { attachCookie, readCookie } from "@/lib/server/cookies";
import { COOKIE_CSRF, jsonOk, randomToken, routeHandler, SESSION_TTL_MS } from "@/lib/server/http";

export const GET = routeHandler(async (req: NextRequest) => {
  const existing = readCookie(req, COOKIE_CSRF);
  const token = existing || randomToken();
  const res = jsonOk({ csrfToken: token }, 200, undefined, req);
  if (!existing) {
    attachCookie(res, COOKIE_CSRF, token, false, SESSION_TTL_MS);
  }
  return res;
});
