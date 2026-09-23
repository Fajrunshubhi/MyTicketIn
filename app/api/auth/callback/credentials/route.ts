import { NextRequest, NextResponse } from "next/server";
import { portalNextPath } from "@/lib/server/access";
import { clearAuthCookies, readCookie, setAuthCookies } from "@/lib/server/cookies";
import { AppError, COOKIE_CSRF, routeHandler } from "@/lib/server/http";
import { loginWithPassword } from "@/lib/server/session";

export const POST = routeHandler(async (req: NextRequest) => {
  const form = await req.formData().catch(() => null);
  const origin = String(process.env.WEB_ORIGIN || process.env.APP_ORIGIN || req.nextUrl.origin).replace(/\/$/, "");
  if (!form) {
    return NextResponse.redirect(`${origin}/login?error=AUTH_INVALID_CREDENTIALS`, 302);
  }
  const cookie = readCookie(req, COOKIE_CSRF);
  const header = req.headers.get("x-csrf-token") || String(form.get("csrfToken") || "");
  if (!cookie || !header || cookie !== header) {
    return NextResponse.redirect(`${origin}/login?error=AUTH_CSRF_INVALID`, 302);
  }
  const portal = String(form.get("portal") || "");
  try {
    const result = await loginWithPassword(String(form.get("username") || ""), String(form.get("password") || ""), portal);
    const next = portalNextPath(result.portal, result.acc, String(form.get("callbackUrl") || ""));
    const res = NextResponse.redirect(`${origin}${next}`, 302);
    setAuthCookies(res, result.raw, result.csrf);
    return res;
  } catch (err) {
    if (err instanceof AppError && err.code === "AUTH_PORTAL_DENIED") {
      const q = new URLSearchParams({ error: "AUTH_PORTAL_DENIED", portal });
      if (err.message) q.set("reason", err.message);
      const res = NextResponse.redirect(`${origin}/login?${q.toString()}`, 302);
      clearAuthCookies(res);
      return res;
    }
    const code = err instanceof AppError ? err.code : "AUTH_INVALID_CREDENTIALS";
    const q = new URLSearchParams({ error: code });
    if (portal) q.set("portal", portal);
    return NextResponse.redirect(`${origin}/login?${q.toString()}`, 302);
  }
});
