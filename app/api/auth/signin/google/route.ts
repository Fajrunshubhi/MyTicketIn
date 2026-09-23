import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { parsePortal } from "@/lib/server/access";
import { attachCookie } from "@/lib/server/cookies";
import { randomToken, routeHandler } from "@/lib/server/http";

const COOKIE_OAUTH = "mti_oauth";

function secret(): string {
  return String(process.env.SESSION_SECRET || "");
}

function sign(payload: string): string {
  const mac = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${mac}.${Buffer.from(payload).toString("base64url")}`;
}

function googleEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function callbackUrl(): string {
  return String(process.env.GOOGLE_REDIRECT_URI || "").trim() || `${String(process.env.WEB_ORIGIN || "http://localhost:3000").replace(/\/$/, "")}/api/auth/callback/google`;
}

export const GET = routeHandler(async (req: NextRequest) => {
  const origin = String(process.env.WEB_ORIGIN || process.env.APP_ORIGIN || req.nextUrl.origin).replace(/\/$/, "");
  if (!googleEnabled()) {
    return NextResponse.redirect(`${origin}/login?error=AUTH_OAUTH_FAILED`, 302);
  }
  const state = randomToken();
  const nonce = randomToken();
  let portal = "buyer";
  try {
    portal = parsePortal(req.nextUrl.searchParams.get("portal") || "");
  } catch {
    portal = "buyer";
  }
  const callback = req.nextUrl.searchParams.get("callbackUrl") || "";
  const payload = `${state}:${nonce}:${callback}:${portal}`;
  const q = new URLSearchParams({
    client_id: String(process.env.GOOGLE_CLIENT_ID),
    redirect_uri: callbackUrl(),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
  });
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`, 302);
  attachCookie(res, COOKIE_OAUTH, sign(payload), true, 10 * 60 * 1000);
  return res;
});
