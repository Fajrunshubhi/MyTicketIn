import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const session = req.cookies.get("mti_session")?.value;
  const path = req.nextUrl.pathname;

  if (path === "/login" || path === "/register") {
    if (session) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (path === "/home") {
    if (session) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  if (!session) {
    const login = new URL("/login", req.url);
    login.searchParams.set("callbackUrl", req.nextUrl.pathname);
    const path = req.nextUrl.pathname;
    if (path.startsWith("/admin")) {
      login.searchParams.set("portal", "admin");
    } else if (path.startsWith("/organizer/events")) {
      login.searchParams.set("portal", "organizer");
    } else {
      login.searchParams.set("portal", "buyer");
    }
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/register",
    "/dashboard",
    "/home",
    "/admin/:path*",
    "/organizer/:path*",
    "/checkout",
    "/orders",
    "/orders/:path*",
    "/tickets",
    "/tickets/:path*",
  ],
};
