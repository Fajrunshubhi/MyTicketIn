import { NextRequest } from "next/server";
import { accessFor, userPayload } from "@/lib/server/access";
import { requireCsrf, setAuthCookies } from "@/lib/server/cookies";
import { consumeEmailOtp } from "@/lib/server/email-otp";
import { AppError, jsonData, routeHandler } from "@/lib/server/http";
import { getUserById, insertRegisteredUser, issueSession, markEmailVerified } from "@/lib/server/session";

export const POST = routeHandler(async (req: NextRequest) => {
  requireCsrf(req);
  const body = (await req.json().catch(() => null)) as {
    challengeId?: string;
    code?: string;
    callbackUrl?: string;
  } | null;
  if (!body?.challengeId) {
    throw new AppError("VALIDATION_ERROR", "Kode OTP tidak lengkap.", {}, 400);
  }
  const consumed = await consumeEmailOtp(body.challengeId, body.code || "");
  if (consumed.purpose === "REGISTER") {
    const payload = consumed.payload;
    const draft = {
      name: String(payload.name || ""),
      username: String(payload.username || ""),
      email: consumed.email,
      phone: String(payload.phone || ""),
      passwordHash: String(payload.passwordHash || ""),
    };
    if (!draft.name || !draft.username || !draft.passwordHash || !draft.phone) {
      throw new AppError("AUTH_RESET_TOKEN_INVALID", "Sesi pendaftaran tidak lengkap. Daftar ulang.", {}, 400);
    }
    const user = await insertRegisteredUser(draft);
    const acc = await accessFor(user);
    const issued = await issueSession(user);
    const res = jsonData(userPayload(user, "buyer", acc, String(payload.intent || "")), 201, req);
    setAuthCookies(res, issued.raw, issued.csrf);
    return res;
  }
  const userId = consumed.userId || String(consumed.payload.userId || "");
  const user = await getUserById(userId);
  if (!user) throw new AppError("AUTH_RESET_TOKEN_INVALID", "Kode OTP tidak valid.", {}, 400);
  await markEmailVerified(user.id);
  const acc = await accessFor(user);
  const issued = await issueSession(user);
  const portal = String(consumed.payload.portal || acc.kind || "buyer");
  const callback = String(body.callbackUrl || consumed.payload.callbackUrl || "");
  const res = jsonData(userPayload(user, portal, acc, callback), 200, req);
  setAuthCookies(res, issued.raw, issued.csrf);
  return res;
});
