import { NextRequest } from "next/server";
import { parseRegisterIntent } from "@/lib/server/access";
import { requireCsrf } from "@/lib/server/cookies";
import { issueEmailOtp } from "@/lib/server/email-otp";
import { AppError, jsonData, routeHandler } from "@/lib/server/http";
import { clientIp } from "@/lib/server/rate-limit";
import { findUserByIdentifier, validateRegisterInput } from "@/lib/server/session";
import bcrypt from "bcryptjs";

export const POST = routeHandler(async (req: NextRequest) => {
  requireCsrf(req);
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    username?: string;
    email?: string;
    phone?: string;
    password?: string;
    confirmPassword?: string;
    intent?: string;
  } | null;
  if (!body) {
    throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", {}, 400);
  }
  parseRegisterIntent(body.intent || "");
  const parsed = validateRegisterInput({
    name: body.name || "",
    username: body.username || "",
    email: body.email || "",
    phone: body.phone || "",
    password: body.password || "",
    confirmPassword: body.confirmPassword || "",
  });
  const takenUser = await findUserByIdentifier(parsed.username);
  if (takenUser) throw new AppError("USERNAME_ALREADY_EXISTS", "Username sudah digunakan.", {}, 409);
  const takenEmail = await findUserByIdentifier(parsed.email);
  if (takenEmail) throw new AppError("EMAIL_ALREADY_EXISTS", "Email sudah terdaftar.", {}, 409);
  const passwordHash = await bcrypt.hash(body.password || "", 12);
  const otp = await issueEmailOtp({
    purpose: "REGISTER",
    email: parsed.email,
    name: parsed.name,
    ip: clientIp(req),
    payload: { ...parsed, passwordHash, intent: "buyer" },
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
});
