import { randomInt } from "crypto";
import { AppError, newId, query, tokenHash } from "@/lib/server/http";
import { emailOtpMail, sendMail } from "@/lib/server/mail";
import { hitRateLimit } from "@/lib/server/rate-limit";

export type OtpPurpose = "REGISTER" | "LOGIN";

const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function sandboxEmail(): boolean {
  return String(process.env.EMAIL_PROVIDER || "sandbox").trim().toLowerCase() === "sandbox";
}

function codeHash(challengeId: string, code: string): string {
  return tokenHash(`${challengeId}:${code}`);
}

export async function issueEmailOtp(input: {
  purpose: OtpPurpose;
  email: string;
  name: string;
  userId?: string | null;
  payload?: Record<string, unknown>;
  ip: string;
}): Promise<{ challengeId: string; emailHint: string; sandboxCode?: string; expiresAt: string }> {
  const email = input.email.trim().toLowerCase();
  const scope = input.purpose === "REGISTER" ? "register" : "login";
  await hitRateLimit(scope, `otp:${email}`, 5, 15 * 60);
  await hitRateLimit("password-reset-ip", `otp:${input.ip || "0"}`, 20, 15 * 60);
  const id = newId();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  await query(
    `UPDATE email_otp_challenges SET consumed_at = CURRENT_TIMESTAMP
     WHERE email=$1 AND purpose=$2 AND consumed_at IS NULL`,
    [email, input.purpose],
  );
  await query(
    `INSERT INTO email_otp_challenges (id, purpose, email, user_id, code_hash, payload, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::timestamptz)`,
    [id, input.purpose, email, input.userId || null, codeHash(id, code), JSON.stringify(input.payload || {}), expiresAt],
  );
  const mail = emailOtpMail({ to: email, name: input.name, code, purpose: input.purpose });
  const sent = await sendMail(mail).catch(() => "failed" as const);
  const hint = email.replace(/^(.).*(@.*)$/, "$1•••$2");
  return {
    challengeId: id,
    emailHint: hint,
    expiresAt,
    ...(sandboxEmail() || sent === "skipped" ? { sandboxCode: code } : {}),
  };
}

export async function consumeEmailOtp(challengeId: string, codeRaw: string): Promise<{
  purpose: OtpPurpose;
  email: string;
  userId: string | null;
  payload: Record<string, unknown>;
}> {
  const code = String(codeRaw || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) throw new AppError("VALIDATION_ERROR", "Kode OTP wajib 6 digit.", { code: "Kode OTP wajib 6 digit." }, 400);
  const rows = await query<{
    id: string;
    purpose: OtpPurpose;
    email: string;
    user_id: string | null;
    code_hash: string;
    payload: unknown;
    expires_at: string;
    attempt_count: number;
    consumed_at: string | null;
  }>(
    `SELECT id, purpose, email, user_id, code_hash, payload, expires_at::text, attempt_count, consumed_at::text
     FROM email_otp_challenges WHERE id=$1 LIMIT 1`,
    [challengeId],
  );
  const row = rows[0];
  if (!row || row.consumed_at) throw new AppError("AUTH_RESET_TOKEN_INVALID", "Kode OTP tidak valid atau sudah dipakai.", {}, 400);
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw new AppError("AUTH_RESET_TOKEN_INVALID", "Kode OTP kedaluwarsa. Minta kode baru.", {}, 400);
  }
  if (row.attempt_count >= MAX_ATTEMPTS) {
    throw new AppError("RATE_LIMITED", "Terlalu banyak percobaan OTP.", {}, 429);
  }
  const ok = row.code_hash === codeHash(row.id, code);
  await query(`UPDATE email_otp_challenges SET attempt_count = attempt_count + 1 WHERE id=$1`, [row.id]);
  if (!ok) throw new AppError("VALIDATION_ERROR", "Kode OTP salah.", { code: "Kode OTP salah." }, 400);
  await query(`UPDATE email_otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id=$1 AND consumed_at IS NULL`, [row.id]);
  const payload = row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {};
  return { purpose: row.purpose, email: row.email, userId: row.user_id, payload };
}
