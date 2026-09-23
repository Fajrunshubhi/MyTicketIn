import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { accessFor, type AuthUser } from "@/lib/server/access";
import { AppError, COOKIE_SESSION, newId, query, randomToken, SESSION_TTL_MS, tokenHash } from "@/lib/server/http";
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

export async function loginWithPassword(identifier: string, password: string, portalRaw: string) {
  const dummy = "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWX12";
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
  const issued = await issueSession(user);
  return { user, acc, portal, ...issued };
}

export async function updateProfile(user: AuthUser, nameRaw: string, emailRaw: string): Promise<AuthUser> {
  const fields: Record<string, string> = {};
  const name = nameRaw.trim();
  if ([...name].length < 2 || [...name].length > 120) fields.name = "Nama wajib 2–120 karakter.";
  const email = emailRaw.trim().toLowerCase();
  if (email.length > 254 || !email.includes("@")) fields.email = "Format email tidak valid.";
  if (Object.keys(fields).length) throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", fields, 400);
  const other = await findUserByIdentifier(email);
  if (other && other.id !== user.id) {
    throw new AppError("EMAIL_ALREADY_EXISTS", "Email sudah terdaftar.", {}, 409);
  }
  const rows = await query<AuthUser & { role: string; status: string; auth_version: number }>(
    `UPDATE users SET name = $2, email = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id, name, username, email, role::text AS role, status::text AS status, auth_version`,
    [user.id, name, email],
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
}): Promise<AuthUser> {
  const fields: Record<string, string> = {};
  const name = input.name.trim();
  if ([...name].length < 2 || [...name].length > 120) fields.name = "Nama wajib 2–120 karakter.";
  const username = input.username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    fields.username = "Username 3–40 karakter: huruf kecil, angka, titik, underscore, atau strip.";
  }
  const email = input.email.trim().toLowerCase();
  if (email.length > 254 || !email.includes("@")) fields.email = "Format email tidak valid.";
  if (input.password.length < 10 || input.password.length > 128) fields.password = "Kata sandi wajib 10–128 karakter.";
  if (input.password !== input.confirmPassword) fields.confirmPassword = "Konfirmasi kata sandi tidak sama.";
  if (Object.keys(fields).length) throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", fields, 400);
  const hash = await bcrypt.hash(input.password, 12);
  const id = newId();
  try {
    const rows = await query<AuthUser & { role: string; status: string; auth_version: number }>(
      `INSERT INTO users (id, name, username, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, 'USER'::user_role)
       RETURNING id, name, username, email, role::text AS role, status::text AS status, auth_version`,
      [id, name, username, email, hash],
    );
    const row = rows[0];
    if (!row) throw new AppError("INTERNAL_ERROR", "Terjadi kesalahan internal.", {}, 500);
    return mapUser(row);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw err;
  }
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
    `INSERT INTO users (id, name, username, email, role)
     VALUES ($1, $2, $3, $4, 'USER'::user_role)
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

export async function requestPasswordReset(emailRaw: string): Promise<void> {
  const email = emailRaw.trim().toLowerCase();
  const user = await findUserByIdentifier(email);
  if (!user || !user.passwordHash || user.status !== "ACTIVE") return;
  const raw = randomToken();
  const now = new Date();
  await query(`UPDATE password_reset_tokens SET revoked_at = $2 WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`, [
    user.id,
    now.toISOString(),
  ]);
  await query(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, requested_ip_hash)
     VALUES ($1, $2, $3, $4, $5)`,
    [newId(), user.id, tokenHash(raw), new Date(now.getTime() + 30 * 60 * 1000).toISOString(), tokenHash("request")],
  );
}

export async function confirmPasswordReset(token: string, password: string, confirm: string): Promise<void> {
  if (password.length < 10 || password.length > 128 || password !== confirm) {
    throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", {
      newPassword: "Kata sandi wajib 10–128 karakter dan konfirmasi harus sama.",
    });
  }
  const hash = tokenHash(token.trim());
  const rows = await query<{ id: string; user_id: string; expires_at: string; used_at: string | null; revoked_at: string | null }>(
    `SELECT id, user_id, expires_at::text, used_at::text, revoked_at::text FROM password_reset_tokens WHERE token_hash = $1 LIMIT 1`,
    [hash],
  );
  const tok = rows[0];
  if (!tok || tok.used_at || tok.revoked_at || !(Date.now() < new Date(tok.expires_at).getTime())) {
    throw new AppError("AUTH_RESET_TOKEN_INVALID", "Token pemulihan tidak valid.", {}, 400);
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await query(`UPDATE users SET password_hash = $2, auth_version = auth_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [
    tok.user_id,
    passwordHash,
  ]);
  await query(`DELETE FROM auth_sessions WHERE user_id = $1`, [tok.user_id]);
  await query(`UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1`, [tok.id]);
}

export async function assistPasswordReset(admin: AuthUser, userId: string, reason: string): Promise<string> {
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
  return raw;
}

export { accessFor, type AuthUser };
