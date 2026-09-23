import { NextRequest, NextResponse } from "next/server";
import { AppError, COOKIE_CSRF, COOKIE_SESSION, SESSION_TTL_MS } from "@/lib/server/http";

function cookieSecure(): boolean {
  const origin = String(process.env.WEB_ORIGIN || process.env.APP_ORIGIN || "").toLowerCase();
  return origin.startsWith("https://") || Boolean(process.env.VERCEL);
}

export function attachCookie(res: NextResponse, name: string, value: string, httpOnly: boolean, maxAgeMs = SESSION_TTL_MS): void {
  const secure = cookieSecure();
  if (!value) {
    res.cookies.set({ name, value: "", path: "/", maxAge: 0, httpOnly, sameSite: "lax", secure });
    return;
  }
  res.cookies.set({
    name,
    value,
    path: "/",
    httpOnly,
    sameSite: "lax",
    secure,
    expires: new Date(Date.now() + maxAgeMs),
  });
}

export function readCookie(req: NextRequest, name: string): string {
  return req.cookies.get(name)?.value || "";
}

export function setAuthCookies(res: NextResponse, sessionRaw: string, csrf: string): void {
  attachCookie(res, COOKIE_SESSION, sessionRaw, true);
  attachCookie(res, COOKIE_CSRF, csrf, false);
}

export function clearAuthCookies(res: NextResponse): void {
  attachCookie(res, COOKIE_SESSION, "", true, 0);
  attachCookie(res, COOKIE_CSRF, "", false, 0);
}

export function requireCsrf(req: NextRequest): void {
  const cookie = readCookie(req, COOKIE_CSRF);
  const header = req.headers.get("x-csrf-token") || req.nextUrl.searchParams.get("csrfToken") || "";
  if (!cookie || !header || cookie !== header) {
    throw new AppError("AUTH_CSRF_INVALID", "Permintaan tidak valid. Muat ulang halaman, lalu coba lagi.", {}, 403);
  }
}
