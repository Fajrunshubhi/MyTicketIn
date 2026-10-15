import { NextRequest } from "next/server";
import { accessFor, userPayload } from "@/lib/server/access";
import { requireCsrf, setAuthCookies } from "@/lib/server/cookies";
import { issueEmailOtp } from "@/lib/server/email-otp";
import { AppError, jsonData, routeHandler } from "@/lib/server/http";
import { clientIp } from "@/lib/server/rate-limit";
import { loginWithPassword } from "@/lib/server/session";

export const POST = routeHandler(async (req: NextRequest) => {
  requireCsrf(req);
  const body = (await req.json().catch(() => null)) as {
    username?: string;
    password?: string;
    callbackUrl?: string;
    portal?: string;
    organizerId?: string;
  } | null;
  if (!body) {
    throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", {}, 400);
  }
  const result = await loginWithPassword(
    body.username || "",
    body.password || "",
    body.portal || "",
    body.organizerId || "",
  );
  if ("otpRequired" in result) {
    const otp = await issueEmailOtp({
      purpose: "LOGIN",
      email: result.user.email,
      name: result.user.name,
      userId: result.user.id,
      ip: clientIp(req),
      payload: { portal: result.portal, callbackUrl: body.callbackUrl || "", userId: result.user.id },
    });
    return jsonData(
      {
        otpRequired: true,
        challengeId: otp.challengeId,
        emailHint: otp.emailHint,
        expiresAt: otp.expiresAt,
        ...(otp.sandboxCode ? { sandboxCode: otp.sandboxCode } : {}),
      },
      200,
      req,
    );
  }
  const acc = result.acc || (await accessFor(result.user));
  const res = jsonData(userPayload(result.user, result.portal, acc, body.callbackUrl || ""), 200, req);
  setAuthCookies(res, result.raw, result.csrf);
  return res;
});
