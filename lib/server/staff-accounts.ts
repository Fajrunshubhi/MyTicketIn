import bcrypt from "bcryptjs";
import { AppError, execute, newId, query } from "@/lib/server/http";

export type StaffAccount = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  status: string;
  version: number;
};

function mapRow(r: {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  status: string;
  version: number;
}): StaffAccount {
  return {
    id: r.id,
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    status: r.status,
    version: Number(r.version),
  };
}

function validateUsername(raw: string): string {
  const username = raw.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", {
      username: "Username 3–40 karakter: huruf kecil, angka, titik, underscore, atau strip.",
    });
  }
  return username;
}

function validateName(raw: string): string {
  const name = raw.trim();
  if ([...name].length < 2 || [...name].length > 120) {
    throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", {
      displayName: "Nama wajib 2–120 karakter.",
    });
  }
  return name;
}

function validatePassword(password: string): void {
  if (password.length < 10 || password.length > 128) {
    throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", {
      password: "Kata sandi wajib 10–128 karakter.",
    });
  }
}

export async function listApprovedOrganizers() {
  return query<{ id: string; name: string }>(
    `SELECT owner_user_id AS id, name
     FROM organizer_profiles
     WHERE status = 'APPROVED'
     ORDER BY lower(name) ASC, id ASC
     LIMIT 200`,
  );
}

export async function listStaffAccounts(organizerUserId: string): Promise<StaffAccount[]> {
  const rows = await query<{
    id: string;
    user_id: string;
    username: string;
    display_name: string;
    status: string;
    version: number;
  }>(
    `SELECT s.id, s.user_id, s.username, u.name AS display_name, s.status::text AS status, s.version
     FROM organizer_staff_accounts s
     JOIN users u ON u.id = s.user_id
     WHERE s.organizer_user_id = $1
     ORDER BY s.status ASC, u.name ASC, s.id ASC`,
    [organizerUserId],
  );
  return rows.map(mapRow);
}

export async function createStaffAccount(
  organizerUserId: string,
  input: { username?: string; displayName?: string; password?: string },
): Promise<StaffAccount> {
  const username = validateUsername(String(input.username || ""));
  const displayName = validateName(String(input.displayName || ""));
  validatePassword(String(input.password || ""));
  const exists = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM organizer_staff_accounts
     WHERE organizer_user_id = $1 AND username = $2`,
    [organizerUserId, username],
  );
  if (Number(exists[0]?.n || 0) > 0) {
    throw new AppError("CONFLICT", "Username petugas sudah dipakai pada penyelenggara ini.", { username: "Username sudah dipakai." }, 409);
  }
  const id = newId();
  const userId = newId();
  const loginUsername = `st.${userId.slice(0, 32)}`.toLowerCase();
  const email = `st.${userId}@staff.invalid`;
  const hash = await bcrypt.hash(String(input.password), 12);
  await query(
    `INSERT INTO users (id, name, username, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5, 'USER'::user_role)`,
    [userId, displayName, loginUsername, email, hash],
  );
  await query(
    `INSERT INTO organizer_staff_accounts (id, organizer_user_id, user_id, username, status, created_at, updated_at, version)
     VALUES ($1, $2, $3, $4, 'ACTIVE'::organizer_staff_status, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`,
    [id, organizerUserId, userId, username],
  );
  const items = await listStaffAccounts(organizerUserId);
  const created = items.find((item) => item.id === id);
  if (!created) throw new AppError("INTERNAL_ERROR", "Terjadi kesalahan internal.", {}, 500);
  return created;
}

export async function updateStaffAccount(
  organizerUserId: string,
  staffId: string,
  input: { username?: string; displayName?: string; password?: string; expectedVersion?: number },
): Promise<StaffAccount> {
  const rows = await query<{
    id: string;
    user_id: string;
    username: string;
    version: number;
    status: string;
  }>(
    `SELECT id, user_id, username, version, status::text AS status
     FROM organizer_staff_accounts
     WHERE id = $1 AND organizer_user_id = $2
     LIMIT 1`,
    [staffId, organizerUserId],
  );
  const row = rows[0];
  if (!row) throw new AppError("NOT_FOUND", "Akun petugas tidak ditemukan.", {}, 404);
  if (Number(input.expectedVersion) !== Number(row.version)) {
    throw new AppError("EVENT_VERSION_CONFLICT", "Data berubah.", {}, 409);
  }
  const username = input.username != null ? validateUsername(input.username) : row.username;
  if (input.displayName != null) {
    const displayName = validateName(input.displayName);
    await execute(`UPDATE users SET name = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [row.user_id, displayName]);
  }
  if (input.password) {
    validatePassword(input.password);
    const hash = await bcrypt.hash(input.password, 12);
    await execute(`UPDATE users SET password_hash = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [row.user_id, hash]);
  }
  const n = await execute(
    `UPDATE organizer_staff_accounts
     SET username = $2, updated_at = CURRENT_TIMESTAMP, version = version + 1
     WHERE id = $1 AND organizer_user_id = $3 AND version = $4`,
    [staffId, username, organizerUserId, row.version],
  );
  if (!n) throw new AppError("EVENT_VERSION_CONFLICT", "Data berubah.", {}, 409);
  const items = await listStaffAccounts(organizerUserId);
  const updated = items.find((item) => item.id === staffId);
  if (!updated) throw new AppError("NOT_FOUND", "Akun petugas tidak ditemukan.", {}, 404);
  return updated;
}

export async function disableStaffAccount(organizerUserId: string, staffId: string, expectedVersion: number): Promise<void> {
  const rows = await query<{ user_id: string; version: number }>(
    `SELECT user_id, version FROM organizer_staff_accounts
     WHERE id = $1 AND organizer_user_id = $2 LIMIT 1`,
    [staffId, organizerUserId],
  );
  const row = rows[0];
  if (!row) throw new AppError("NOT_FOUND", "Akun petugas tidak ditemukan.", {}, 404);
  if (Number(row.version) !== Number(expectedVersion)) {
    throw new AppError("EVENT_VERSION_CONFLICT", "Data berubah.", {}, 409);
  }
  const n = await execute(
    `UPDATE organizer_staff_accounts
     SET status = 'DISABLED'::organizer_staff_status, updated_at = CURRENT_TIMESTAMP, version = version + 1
     WHERE id = $1 AND organizer_user_id = $2 AND version = $3 AND status = 'ACTIVE'`,
    [staffId, organizerUserId, expectedVersion],
  );
  if (!n) throw new AppError("EVENT_VERSION_CONFLICT", "Data berubah.", {}, 409);
  await execute(
    `UPDATE event_staff_assignments
     SET status = 'REVOKED'::event_staff_assignment_status, revoked_at = CURRENT_TIMESTAMP,
         revocation_reason = 'Akun petugas dihapus penyelenggara', updated_at = CURRENT_TIMESTAMP, version = version + 1
     WHERE user_id = $1 AND status = 'ACTIVE'`,
    [row.user_id],
  );
  await execute(
    `UPDATE users SET status = 'DISABLED'::user_status, auth_version = auth_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [row.user_id],
  );
  await query(`DELETE FROM auth_sessions WHERE user_id = $1`, [row.user_id]);
}

export async function findStaffForLogin(organizerUserId: string, localUsername: string) {
  const username = localUsername.trim().toLowerCase();
  const rows = await query<{
    staff_id: string;
    staff_status: string;
    id: string;
    name: string;
    username: string;
    email: string;
    password_hash: string | null;
    role: string;
    status: string;
    auth_version: number;
  }>(
    `SELECT s.id AS staff_id, s.status::text AS staff_status,
            u.id, u.name, u.username, u.email, u.password_hash, u.role::text AS role, u.status::text AS status, u.auth_version
     FROM organizer_staff_accounts s
     JOIN users u ON u.id = s.user_id
     WHERE s.organizer_user_id = $1 AND s.username = $2
     LIMIT 1`,
    [organizerUserId, username],
  );
  return rows[0] || null;
}

export async function listAssignedEvents(staffUserId: string) {
  return query<{ id: string; title: string; starts_at: string; venue_name: string }>(
    `SELECT e.id, e.title, e.starts_at::text, e.venue_name
     FROM event_staff_assignments a
     JOIN events e ON e.id = a.event_id
     WHERE a.user_id = $1 AND a.status = 'ACTIVE'
     ORDER BY e.starts_at ASC, e.id ASC`,
    [staffUserId],
  );
}
