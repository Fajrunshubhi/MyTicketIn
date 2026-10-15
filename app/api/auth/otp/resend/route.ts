import { NextRequest } from "next/server";
import { requireCsrf } from "@/lib/server/cookies";
import { issueEmailOtp } from "@/lib/server/email-otp";
import { AppError, jsonData, query, routeHandler } from "@/lib/server/http";
import { clientIp } from "@/lib/server/rate-limit";

export const POST = routeHandler(async (req: NextRequest) => {
  requireCsrf(req);
  const body = (await req.json().catch(() => null)) as { challengeId?: string } | null;
  const id = String(body?.challengeId || "");
  if (!id) throw new AppError("VALIDATION_ERROR", "Sesi OTP tidak ditemukan.", {}, 400);
  const rows = await query<{
    purpose: "REGISTER" | "LOGIN";
    email: string;
    user_id: string | null;
    payload: unknown;
    consumed_at: string | null;
  }>(
    `SELECT purpose, email, user_id, payload, consumed_at::text FROM email_otp_challenges WHERE id=$1 LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row || row.consumed_at) throw new AppError("AUTH_RESET_TOKEN_INVALID", "Minta kode baru dari awal.", {}, 400);
  const payload = row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {};
  const otp = await issueEmailOtp({
    purpose: row.purpose,
    email: row.email,
    name: String(payload.name || "Pengguna"),
    userId: row.user_id,
    payload,
    ip: clientIp(req),
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
