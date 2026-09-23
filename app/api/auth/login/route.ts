import { NextRequest } from "next/server";
import { accessFor, userPayload } from "@/lib/server/access";
import { requireCsrf, setAuthCookies } from "@/lib/server/cookies";
import { AppError, jsonData, routeHandler } from "@/lib/server/http";
import { loginWithPassword } from "@/lib/server/session";

export const POST = routeHandler(async (req: NextRequest) => {
  requireCsrf(req);
  const body = (await req.json().catch(() => null)) as {
    username?: string;
    password?: string;
    callbackUrl?: string;
    portal?: string;
  } | null;
  if (!body) {
    throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", {}, 400);
  }
  const result = await loginWithPassword(body.username || "", body.password || "", body.portal || "");
  const acc = result.acc || (await accessFor(result.user));
  const res = jsonData(userPayload(result.user, result.portal, acc, body.callbackUrl || ""), 200, req);
  setAuthCookies(res, result.raw, result.csrf);
  return res;
});
