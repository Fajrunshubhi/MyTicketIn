import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { parsePhoneId } from "@/lib/phone-id";
import { accessFor, type AuthUser } from "@/lib/server/access";
import { AppError, COOKIE_SESSION, newId, query, randomToken, SESSION_TTL_MS, tokenHash } from "@/lib/server/http";
import { sendPasswordResetMail, passwordResetUrl } from "@/lib/server/mail";
import { readCookie } from "@/lib/server/cookies";

type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  csrf_hash: string;
  auth_version: number;
  expires_at: string;
  name: string;
  username: string;
  email: string;
  role: string;
  status: string;
  user_auth_version: number;
};

function mapUser(row: {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  status: string;
  auth_version: number | string;
}): AuthUser {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    role: row.role,
    status: row.status,
    authVersion: Number(row.auth_version),
  };
}

export async function sessionFromToken(raw: string): Promise<{ user: AuthUser; expiresAt: Date } | null> {
  if (!raw) return null;
  const rows = await query<SessionRow>(
    `SELECT s.id, s.user_id, s.token_hash, s.csrf_hash, s.auth_version, s.expires_at::text,
            u.name, u.username, u.email, u.role::text AS role, u.status::text AS status, u.auth_version AS user_auth_version
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
     LIMIT 1`,
    [tokenHash(raw)],
  );
  const row = rows[0];
  if (!row) return null;
  const exp = new Date(row.expires_at);
  if (!(Date.now() < exp.getTime())) {
    await query(`DELETE FROM auth_sessions WHERE token_hash = $1`, [row.token_hash]);
    return null;
  }
  if (Number(row.user_auth_version) !== Number(row.auth_version)) {
    await query(`DELETE FROM auth_sessions WHERE token_hash = $1`, [row.token_hash]);
    return null;
  }
  if (row.status !== "ACTIVE") return null;
  return {
    user: mapUser({
      id: row.user_id,
      name: row.name,
      username: row.username,
      email: row.email,
      role: row.role,
      status: row.status,
      auth_version: row.user_auth_version,
    }),
    expiresAt: exp,
  };
}

export async function sessionFromRequest(req: NextRequest): Promise<{ user: AuthUser; expiresAt: Date } | null> {
  return sessionFromToken(readCookie(req, COOKIE_SESSION));
}

export async function requireUser(req: NextRequest): Promise<AuthUser> {
  const sess = await sessionFromRequest(req);
  if (!sess) throw new AppError("AUTH_REQUIRED", "Anda perlu masuk.", {}, 401);
  return sess.user;
}

export async function issueSession(user: AuthUser): Promise<{ raw: string; csrf: string; expiresAt: Date }> {
  const raw = randomToken();
  const csrf = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await query(
    `INSERT INTO auth_sessions (id, user_id, token_hash, csrf_hash, auth_version, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [newId(), user.id, tokenHash(raw), tokenHash(csrf), user.authVersion, expiresAt.toISOString()],
  );
  await query(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [user.id]);
  return { raw, csrf, expiresAt };
}

export async function deleteSession(raw: string): Promise<void> {
  if (!raw) return;
  await query(`DELETE FROM auth_sessions WHERE token_hash = $1`, [tokenHash(raw)]);
}

export async function findUserByIdentifier(identifier: string): Promise<(AuthUser & { passwordHash: string | null }) | null> {
  const idn = identifier.trim().toLowerCase();
  const rows = await query<{
    id: string;
    name: string;
    username: string;
    email: string;
    password_hash: string | null;
    role: string;
    status: string;
    auth_version: number;
  }>(
    `SELECT id, name, username, email, password_hash, role::text AS role, status::text AS status, auth_version
     FROM users WHERE username = $1 OR email = $1 LIMIT 1`,
    [idn],
  );
  const row = rows[0];
  if (!row) return null;
  return { ...mapUser(row), passwordHash: row.password_hash };
}

export type PasswordLoginResult =
  | { user: AuthUser; acc: Awaited<ReturnType<typeof accessFor>>; portal: string; otpRequired: true }
  | {
      user: AuthUser;
      acc: Awaited<ReturnType<typeof accessFor>>;
      portal: string;
      raw: string;
      csrf: string;
      expiresAt: Date;
    };

export async function loginWithPassword(
  identifier: string,
  password: string,
  portalRaw: string,
  organizerId = "",
): Promise<PasswordLoginResult> {
  const dummy = "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWX12";
  const portalHint = portalRaw.trim().toLowerCase();
  if (portalHint === "staff") {
    if (!identifier.trim() || !password || !organizerId.trim()) {
      await bcrypt.compare(password || "x", dummy);
      throw new AppError("AUTH_INVALID_CREDENTIALS", "Username atau kata sandi salah.", {}, 401);
    }
    const { findStaffForLogin } = await import("@/lib/server/staff-accounts");
    const row = await findStaffForLogin(organizerId.trim(), identifier);
    if (!row || !row.password_hash) {
      await bcrypt.compare(password, dummy);
      throw new AppError(
        "AUTH_PORTAL_DENIED",
        "Akun petugas tidak terdaftar pada penyelenggara ini.",
        {},
        403,
      );
    }
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) throw new AppError("AUTH_INVALID_CREDENTIALS", "Username atau kata sandi salah.", {}, 401);
    if (row.staff_status !== "ACTIVE" || row.status !== "ACTIVE") {
      throw new AppError("FORBIDDEN", "Akun petugas dinonaktifkan.", {}, 403);
    }
    const user = mapUser(row);
    const acc = await accessFor(user);
    const { authorizePortal, resolvePortal } = await import("@/lib/server/access");
    const portal = resolvePortal(portalRaw, acc);
    const denied = authorizePortal(portal, acc);
    if (denied) throw new AppError("AUTH_PORTAL_DENIED", denied, {}, 403);
    const issued = await issueSession(user);
    return { user, acc, portal, ...issued };
  }
  if (!identifier.trim() || !password) {
    await bcrypt.compare(password || "x", dummy);
    throw new AppError("AUTH_INVALID_CREDENTIALS", "Username atau kata sandi salah.", {}, 401);
  }
  const user = await findUserByIdentifier(identifier);
  if (!user || !user.passwordHash) {
    await bcrypt.compare(password, dummy);
    throw new AppError("AUTH_INVALID_CREDENTIALS", "Username atau kata sandi salah.", {}, 401);
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new AppError("AUTH_INVALID_CREDENTIALS", "Username atau kata sandi salah.", {}, 401);
  if (user.status !== "ACTIVE") {
    throw new AppError("FORBIDDEN", user.status === "SUSPENDED" ? "Akun ditangguhkan." : "Akun dinonaktifkan.", {}, 403);
  }
  const acc = await accessFor(user);
  const { authorizePortal, resolvePortal } = await import("@/lib/server/access");
  const portal = resolvePortal(portalRaw, acc);
  const denied = authorizePortal(portal, acc);
  if (denied) throw new AppError("AUTH_PORTAL_DENIED", denied, {}, 403);
  return { user, acc, portal, otpRequired: true as const };
}

export type BuyerProfile = AuthUser & {
  phone: string | null;
  dateOfBirth: string | null;
  city: string | null;
  gender: string | null;
  emailVerifiedAt: string | null;
};

export async function getBuyerProfile(userId: string): Promise<BuyerProfile | null> {
  const rows = await query<{
    id: string;
    name: string;
    username: string;
    email: string;
    role: string;
    status: string;
    auth_version: number;
    phone: string | null;
    date_of_birth: string | null;
    city: string | null;
    gender: string | null;
    email_verified_at: string | null;
  }>(
    `SELECT id, name, username, email, role::text AS role, status::text AS status, auth_version,
            phone, date_of_birth::text, city, gender, email_verified_at::text
       FROM users WHERE id=$1 LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...mapUser(row),
    phone: row.phone,
    dateOfBirth: row.date_of_birth,
    city: row.city,
    gender: row.gender,
    emailVerifiedAt: row.email_verified_at,
  };
}

const GENDERS = new Set(["FEMALE", "MALE", "OTHER", "UNDISCLOSED"]);

export async function updateProfile(
  user: AuthUser,
  input: {
    name: string;
    username?: string;
    email: string;
    phone?: string;
    dateOfBirth?: string;
    city?: string;
    gender?: string;
  },
): Promise<BuyerProfile> {
  const fields: Record<string, string> = {};
  const name = input.name.trim();
  if ([...name].length < 2 || [...name].length > 120) fields.name = "Nama wajib 2–120 karakter.";
  const username = String(input.username || user.username).trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    fields.username = "Username 3–40 karakter: huruf kecil, angka, titik, underscore, atau strip.";
  }
  const email = input.email.trim().toLowerCase();
  if (email.length > 254 || !email.includes("@")) fields.email = "Format email tidak valid.";
  const phoneRaw = String(input.phone || "").trim();
  const phone = phoneRaw ? parsePhoneId(phoneRaw) : null;
  if (phoneRaw && !phone) fields.phone = "Nomor HP Indonesia tidak valid. Contoh: 081234567890.";
  const city = String(input.city || "").trim();
  if (city && (city.length < 2 || city.length > 80)) fields.city = "Kota/kabupaten 2–80 karakter.";
  const gender = String(input.gender || "").trim().toUpperCase();
  if (gender && !GENDERS.has(gender)) fields.gender = "Pilih jenis kelamin yang tersedia.";
  let dob: string | null = null;
  const dobRaw = String(input.dateOfBirth || "").trim();
  if (dobRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dobRaw)) fields.dateOfBirth = "Tanggal lahir tidak valid.";
    else {
      const d = new Date(`${dobRaw}T00:00:00Z`);
      const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (Number.isNaN(d.getTime()) || age < 13 || age > 120) fields.dateOfBirth = "Usia minimal 13 tahun.";
      else dob = dobRaw;
    }
  }
  if (Object.keys(fields).length) throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", fields, 400);
  if (username !== user.username) {
    const taken = await findUserByIdentifier(username);
    if (taken && taken.id !== user.id) throw new AppError("USERNAME_ALREADY_EXISTS", "Username sudah digunakan.", {}, 409);
  }
  if (email !== user.email) {
    const other = await findUserByIdentifier(email);
    if (other && other.id !== user.id) throw new AppError("EMAIL_ALREADY_EXISTS", "Email sudah terdaftar.", {}, 409);
  }
  const emailChanged = email !== user.email;
  await query(
    `UPDATE users SET name=$2, username=$3, email=$4, phone=$5, date_of_birth=$6::date, city=$7, gender=$8,
            email_verified_at = CASE WHEN $9 THEN NULL ELSE email_verified_at END,
            updated_at = CURRENT_TIMESTAMP
     WHERE id=$1`,
    [user.id, name, username, email, phone, dob, city || null, gender || null, emailChanged],
  );
  const updated = await getBuyerProfile(user.id);
  if (!updated) throw new AppError("INTERNAL_ERROR", "Terjadi kesalahan internal.", {}, 500);
  return updated;
}

export type RegisterDraft = {
  name: string;
  username: string;
  email: string;
  phone: string;
  passwordHash: string;
};

export function validateRegisterInput(input: {
  name: string;
  username: string;
  email: string;
  phone?: string;
  password: string;
  confirmPassword: string;
}): { name: string; username: string; email: string; phone: string } {
  const fields: Record<string, string> = {};
  const name = input.name.trim();
  if ([...name].length < 2 || [...name].length > 120) fields.name = "Nama wajib 2–120 karakter.";
  const username = input.username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    fields.username = "Username 3–40 karakter: huruf kecil, angka, titik, underscore, atau strip.";
  }
  const email = input.email.trim().toLowerCase();
  if (email.length > 254 || !email.includes("@")) fields.email = "Format email tidak valid.";
  const phone = parsePhoneId(String(input.phone || ""));
  if (!phone) fields.phone = "Nomor HP Indonesia wajib. Contoh: 081234567890.";
  if (input.password.length < 10 || input.password.length > 128) fields.password = "Kata sandi wajib 10–128 karakter.";
  if (input.password !== input.confirmPassword) fields.confirmPassword = "Konfirmasi kata sandi tidak sama.";
  if (Object.keys(fields).length || !phone) throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", fields, 400);
  return { name, username, email, phone };
}

export async function insertRegisteredUser(draft: RegisterDraft): Promise<AuthUser> {
  const id = newId();
  const rows = await query<AuthUser & { role: string; status: string; auth_version: number }>(
    `INSERT INTO users (id, name, username, email, phone, password_hash, role, email_verified_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'USER'::user_role, CURRENT_TIMESTAMP)
     RETURNING id, name, username, email, role::text AS role, status::text AS status, auth_version`,
    [id, draft.name, draft.username, draft.email, draft.phone, draft.passwordHash],
  );
  const row = rows[0];
  if (!row) throw new AppError("INTERNAL_ERROR", "Terjadi kesalahan internal.", {}, 500);
  return mapUser(row);
}

export async function registerUser(input: {
  name: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  phone?: string;
}): Promise<AuthUser> {
  const parsed = validateRegisterInput(input);
  const hash = await bcrypt.hash(input.password, 12);
  return insertRegisteredUser({ ...parsed, passwordHash: hash });
}

export async function markEmailVerified(userId: string): Promise<void> {
  await query(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id=$1`, [
    userId,
  ]);
}

export async function revokeAllSessions(user: AuthUser): Promise<void> {
  await query(`UPDATE users SET auth_version = auth_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [user.id]);
  await query(`DELETE FROM auth_sessions WHERE user_id = $1`, [user.id]);
}

export async function getUserById(id: string): Promise<AuthUser | null> {
  const rows = await query<{
    id: string;
    name: string;
    username: string;
    email: string;
    role: string;
    status: string;
    auth_version: number;
  }>(
    `SELECT id, name, username, email, role::text AS role, status::text AS status, auth_version FROM users WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

function googleUsername(email: string): string {
  const at = email.indexOf("@");
  let base = (at > 0 ? email.slice(0, at) : email).toLowerCase();
  base = base.replace(/[^a-z0-9._-]/g, "");
  if (base.length < 3) base = `user${base}`;
  return base.slice(0, 40);
}

export async function resolveGoogle(
  profile: { subject: string; email: string; emailVerified: boolean; name: string },
  actor: AuthUser | null,
): Promise<AuthUser> {
  if (!profile.emailVerified || !profile.email || !profile.subject) {
    throw new AppError("AUTH_OAUTH_FAILED", "Login Google gagal.", {}, 401);
  }
  const email = profile.email.trim().toLowerCase();
  const linked = await query<{
    id: string;
    name: string;
    username: string;
    email: string;
    role: string;
    status: string;
    auth_version: number;
  }>(
    `SELECT u.id, u.name, u.username, u.email, u.role::text AS role, u.status::text AS status, u.auth_version
     FROM auth_accounts a JOIN users u ON u.id = a.user_id
     WHERE a.provider = 'google' AND a.provider_account_id = $1 LIMIT 1`,
    [profile.subject],
  );
  if (linked[0]) {
    const user = mapUser(linked[0]);
    if (user.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Akun dinonaktifkan.", {}, 403);
    return user;
  }
  const byEmail = await findUserByIdentifier(email);
  if (byEmail) {
    if (!actor || actor.id !== byEmail.id) {
      throw new AppError("AUTH_ACCOUNT_LINK_REQUIRED", "Masuk dengan akun lokal untuk menautkan Google.", {}, 409);
    }
    await query(
      `INSERT INTO auth_accounts (id, user_id, type, provider, provider_account_id) VALUES ($1, $2, 'oauth', 'google', $3)`,
      [newId(), byEmail.id, profile.subject],
    );
    return byEmail;
  }
  const id = newId();
  const username = googleUsername(email);
  const name = profile.name.trim() || username;
  const rows = await query<AuthUser & { role: string; status: string; auth_version: number }>(
    `INSERT INTO users (id, name, username, email, role, email_verified_at)
     VALUES ($1, $2, $3, $4, 'USER'::user_role, CURRENT_TIMESTAMP)
     RETURNING id, name, username, email, role::text AS role, status::text AS status, auth_version`,
    [id, name, username, email],
  );
  const created = mapUser(rows[0]);
  await query(
    `INSERT INTO auth_accounts (id, user_id, type, provider, provider_account_id) VALUES ($1, $2, 'oauth', 'google', $3)`,
    [newId(), created.id, profile.subject],
  );
  return created;
}

export async function requestPasswordReset(emailRaw: string, ip = ""): Promise<void> {
  const started = Date.now();
  const dummy = "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWX12";
  const email = emailRaw.trim().toLowerCase();
  await bcrypt.compare("dummy-reset-probe", dummy);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    await padResetTiming(started);
    return;
  }
  const user = await findUserByIdentifier(email);
  if (!user || !user.passwordHash || user.status !== "ACTIVE") {
    await padResetTiming(started);
    return;
  }
  const raw = randomToken();
  const now = new Date();
  await query(`UPDATE password_reset_tokens SET revoked_at = $2 WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`, [
    user.id,
    now.toISOString(),
  ]);
  await query(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, requested_ip_hash)
     VALUES ($1, $2, $3, $4, $5)`,
    [newId(), user.id, tokenHash(raw), new Date(now.getTime() + 30 * 60 * 1000).toISOString(), tokenHash(ip || "unknown")],
  );
  await sendPasswordResetMail({ to: user.email, name: user.name, resetUrl: passwordResetUrl(raw) });
  await padResetTiming(started);
}

async function padResetTiming(started: number) {
  const wait = 450 - (Date.now() - started);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

export async function confirmPasswordReset(token: string, password: string, confirm: string): Promise<void> {
  if (password.length < 10 || password.length > 128 || password !== confirm) {
    throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", {
      newPassword: "Kata sandi wajib 10–128 karakter dan konfirmasi harus sama.",
    });
  }
  const hash = tokenHash(token.trim());
  const consumed = await query<{ id: string; user_id: string }>(
    `UPDATE password_reset_tokens
     SET used_at = CURRENT_TIMESTAMP
     WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
     RETURNING id, user_id`,
    [hash],
  );
  const tok = consumed[0];
  if (!tok) {
    throw new AppError("AUTH_RESET_TOKEN_INVALID", "Tautan pemulihan tidak valid atau sudah dipakai.", {}, 400);
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await query(`UPDATE users SET password_hash = $2, auth_version = auth_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [
    tok.user_id,
    passwordHash,
  ]);
  await query(`DELETE FROM auth_sessions WHERE user_id = $1`, [tok.user_id]);
  await query(
    `UPDATE password_reset_tokens SET revoked_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND id <> $2 AND used_at IS NULL AND revoked_at IS NULL`,
    [tok.user_id, tok.id],
  );
}

export type AssistedReset = { delivery: "sent" | "skipped"; maskedEmail: string; token?: string };

function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

/**
 * Admin-assisted reset. The reset link goes to the account email, so the admin never handles a usable token.
 * Only when no email provider is configured (sandbox) the token is returned for a controlled demo hand-off.
 */
export async function assistPasswordReset(admin: AuthUser, userId: string, reason: string): Promise<AssistedReset> {
  if (admin.role !== "ADMIN") throw new AppError("FORBIDDEN", "Anda tidak memiliki akses.", {}, 403);
  if ([...reason.trim()].length < 10 || [...reason.trim()].length > 1000) {
    throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", {}, 400);
  }
  const target = (await getUserById(userId)) || (await findUserByIdentifier(userId));
  if (!target || target.status !== "ACTIVE") {
    throw new AppError("AUTH_RESET_NOT_ELIGIBLE", "Akun tidak memenuhi syarat pemulihan.", {}, 400);
  }
  const raw = randomToken();
  const now = new Date();
  await query(`UPDATE password_reset_tokens SET revoked_at = $2 WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`, [
    target.id,
    now.toISOString(),
  ]);
  await query(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, requested_ip_hash, created_by_admin_user_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [newId(), target.id, tokenHash(raw), new Date(now.getTime() + 30 * 60 * 1000).toISOString(), tokenHash("admin"), admin.id],
  );
  const delivery = await sendPasswordResetMail({ to: target.email, name: target.name, resetUrl: passwordResetUrl(raw) });
  if (delivery === "failed") {
    // Nothing was delivered, so the stored token must not stay usable.
    await query(`UPDATE password_reset_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = $1`, [tokenHash(raw)]);
    throw new AppError("EMAIL_DELIVERY_FAILED", "Email pemulihan gagal dikirim. Coba lagi atau periksa konfigurasi email.", {}, 502);
  }
  const { notify } = await import("@/lib/server/notifications");
  await notify({
    recipientUserId: target.id,
    type: "PASSWORD_RESET_ASSISTED",
    title: "Pemulihan kata sandi disiapkan",
    body:
      delivery === "sent"
        ? "Admin mengirim tautan pemulihan kata sandi ke email akun Anda. Tautan sekali pakai dan berlaku 30 menit."
        : "Admin menyiapkan pemulihan kata sandi. Ikuti instruksi yang diserahkan admin. Berlaku 30 menit.",
    actionPath: "/login",
    entityType: "User",
    entityId: target.id,
    deduplicationKey: `pwd-assist:${target.id}:${now.toISOString()}`,
    domainEventId: `pwd-assist:${target.id}:${now.getTime()}`,
  });
  return delivery === "sent"
    ? { delivery, maskedEmail: maskEmail(target.email) }
    : { delivery: "skipped", maskedEmail: maskEmail(target.email), token: raw };
}

export { accessFor, type AuthUser };
