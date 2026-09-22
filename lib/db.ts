import { neon } from "@neondatabase/serverless";
import type { AppUser, PgUserRow } from "./types";

export function hasPostgresUrl(): boolean {
  return /^(postgres|postgresql):\/\//i.test(process.env.DATABASE_URL || "");
}

export function assertDatabase(): void {
  if (!hasPostgresUrl()) {
    throw new Error("DATABASE_URL PostgreSQL wajib. Persistence JSON tidak tersedia.");
  }
}

export function getSql() {
  assertDatabase();
  return neon(process.env.DATABASE_URL as string);
}

export async function ensurePostgres() {
  return getSql();
}

export function mapPgUser(row: PgUserRow | undefined | null): AppUser | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    googleId: row.google_id,
    createdAt: row.created_at,
  };
}

export type { AppUser };
