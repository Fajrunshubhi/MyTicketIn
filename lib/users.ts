import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { assertDatabase, ensurePostgres, mapPgUser, hasPostgresUrl } from "./db";
import type { AppUser, CreateUserInput, GoogleUserInput, PgUserRow } from "./types";

export async function findUserByUsernameOrEmail(
  identifier: string
): Promise<AppUser | null> {
  assertDatabase();
  const value = String(identifier || "").trim().toLowerCase();
  if (!value) return null;

  if (!hasPostgresUrl()) {
    throw new Error("Database tidak tersedia.");
  }

  const sql = await ensurePostgres();
  const rows = (await sql`
    SELECT id, name, username, email, password_hash, role, google_id, created_at
    FROM users
    WHERE lower(username) = ${value} OR lower(email) = ${value}
    LIMIT 1
  `) as PgUserRow[];
  return mapPgUser(rows[0]);
}

export async function usernameExists(username: string): Promise<boolean> {
  const user = await findUserByUsernameOrEmail(username);
  return Boolean(
    user && user.username.toLowerCase() === String(username).trim().toLowerCase()
  );
}

export async function emailExists(email: string): Promise<boolean> {
  const user = await findUserByUsernameOrEmail(email);
  return Boolean(
    user && user.email.toLowerCase() === String(email).trim().toLowerCase()
  );
}

export async function createUser({
  username,
  email,
  name,
  password,
  role = "USER",
}: CreateUserInput): Promise<Pick<AppUser, "id" | "username" | "email" | "name" | "role">> {
  assertDatabase();
  const normalizedUsername = username.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);
  const id = randomUUID();

  const sql = await ensurePostgres();
  const rows = (await sql`
    INSERT INTO users (id, name, username, email, password_hash, role)
    VALUES (${id}, ${name.trim()}, ${normalizedUsername}, ${normalizedEmail}, ${passwordHash}, ${role})
    RETURNING id, name, username, email, password_hash, role, google_id, created_at
  `) as PgUserRow[];
  const created = mapPgUser(rows[0]);
  if (!created) {
    throw new Error("Gagal membuat akun.");
  }
  return {
    id: created.id,
    username: created.username,
    email: created.email,
    name: created.name,
    role: created.role,
  };
}

export async function upsertGoogleUser({
  email,
  name,
  googleId,
}: GoogleUserInput): Promise<AppUser | null> {
  assertDatabase();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;

  const existing = await findUserByUsernameOrEmail(normalizedEmail);
  const sql = await ensurePostgres();
  if (existing) {
    const rows = (await sql`
      UPDATE users
      SET google_id = COALESCE(google_id, ${googleId}),
          name = COALESCE(name, ${name || existing.name})
      WHERE id = ${existing.id}
      RETURNING id, name, username, email, password_hash, role, google_id, created_at
    `) as PgUserRow[];
    return mapPgUser(rows[0]);
  }

  const base = normalizedEmail.split("@")[0].replace(/[^a-z0-9._-]/g, "") || "user";
  let username = base;
  let suffix = 1;
  while (await findUserByUsernameOrEmail(username)) {
    username = `${base}${suffix}`;
    suffix += 1;
  }

  const rows = (await sql`
    INSERT INTO users (id, name, username, email, role, google_id)
    VALUES (${randomUUID()}, ${name || username}, ${username}, ${normalizedEmail}, ${"USER"}, ${googleId})
    RETURNING id, name, username, email, password_hash, role, google_id, created_at
  `) as PgUserRow[];
  return mapPgUser(rows[0]);
}
