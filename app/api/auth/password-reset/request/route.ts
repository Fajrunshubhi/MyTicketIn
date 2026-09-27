import { NextRequest } from "next/server";
import { jsonOk, routeHandler } from "@/lib/server/http";
import { requireMutating, readJson } from "@/lib/server/guard";
import { requestPasswordReset } from "@/lib/server/session";
import { clientIp, hitRateLimit } from "@/lib/server/rate-limit";

const GENERIC = "Jika alamat itu terdaftar sebagai akun lokal, kami mengirim tautan sekali pakai. Periksa kotak masuk dan folder spam.";

export const POST = routeHandler(async (req: NextRequest) => {
  requireMutating(req);
  const body = await readJson<{ email?: string }>(req);
  const email = String(body.email || "").trim().toLowerCase();
  const ip = clientIp(req);
  const isDev = process.env.APP_ENV === "development" || process.env.NODE_ENV !== "production";
  await hitRateLimit("password-reset-email", email || "empty", isDev ? 30 : 3, 3600);
  await hitRateLimit("password-reset-ip", ip, isDev ? 60 : 10, 3600);
  await requestPasswordReset(email, ip);
  return jsonOk({ data: { message: GENERIC } }, 202, undefined, req);
});
