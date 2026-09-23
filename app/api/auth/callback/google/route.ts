import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { accessFor, authorizePortal, parsePortal, portalNextPath } from "@/lib/server/access";
import { attachCookie, readCookie, setAuthCookies } from "@/lib/server/cookies";
import { issueSession, resolveGoogle, sessionFromRequest } from "@/lib/server/session";
import { AppError, routeHandler } from "@/lib/server/http";

const COOKIE_OAUTH = "mti_oauth";

function secret(): string {
  return String(process.env.SESSION_SECRET || "");
}

function unsign(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const payload = Buffer.from(parts[1], "base64url").toString("utf8");
  const want = createHmac("sha256", secret()).update(payload).digest("base64url");
  const got = parts[0];
  try {
    if (got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) return null;
  } catch {
    return null;
  }
  return payload;
}

function callbackUrl(): string {
  return (
    String(process.env.GOOGLE_REDIRECT_URI || "").trim() ||
    `${String(process.env.WEB_ORIGIN || "http://localhost:3000").replace(/\/$/, "")}/api/auth/callback/google`
  );
}

async function exchangeGoogle(code: string) {
  const form = new URLSearchParams({
    code,
    client_id: String(process.env.GOOGLE_CLIENT_ID || ""),
    client_secret: String(process.env.GOOGLE_CLIENT_SECRET || ""),
    redirect_uri: callbackUrl(),
    grant_type: "authorization_code",
  });
  const tokRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const tok = (await tokRes.json()) as { access_token?: string };
  if (!tok.access_token) throw new AppError("AUTH_OAUTH_FAILED", "Login Google gagal.", {}, 401);
  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  const p = (await infoRes.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
  return { subject: p.sub || "", email: p.email || "", emailVerified: Boolean(p.email_verified), name: p.name || "" };
}

export const GET = routeHandler(async (req: NextRequest) => {
  const origin = String(process.env.WEB_ORIGIN || process.env.APP_ORIGIN || req.nextUrl.origin).replace(/\/$/, "");
  if (req.nextUrl.searchParams.get("error")) {
    return NextResponse.redirect(`${origin}/login?error=AUTH_OAUTH_FAILED`, 302);
  }
  const payload = unsign(readCookie(req, COOKIE_OAUTH));
  const parts = payload ? payload.split(":") : [];
  if (parts.length < 3 || parts[0] !== req.nextUrl.searchParams.get("state")) {
    return NextResponse.redirect(`${origin}/login?error=AUTH_OAUTH_FAILED`, 302);
  }
  const callback = parts[2] || "";
  const oauthPortal = parts[3] || "buyer";
  try {
    const profile = await exchangeGoogle(req.nextUrl.searchParams.get("code") || "");
    const sess = await sessionFromRequest(req);
    const user = await resolveGoogle(profile, sess?.user || null);
    const acc = await accessFor(user);
    let portal = oauthPortal;
    try {
      portal = parsePortal(oauthPortal);
    } catch {
      portal = acc.kind;
    }
    const denied = authorizePortal(portal, acc);
    if (denied) {
      return NextResponse.redirect(`${origin}/login?error=AUTH_PORTAL_DENIED&portal=${encodeURIComponent(portal)}`, 302);
    }
    const issued = await issueSession(user);
    const next = portalNextPath(portal, acc, callback);
    const res = NextResponse.redirect(`${origin}${next}`, 302);
    setAuthCookies(res, issued.raw, issued.csrf);
    attachCookie(res, COOKIE_OAUTH, "", true, 0);
    return res;
  } catch (err) {
    const code = err instanceof AppError ? err.code : "AUTH_OAUTH_FAILED";
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(code)}`, 302);
  }
});
