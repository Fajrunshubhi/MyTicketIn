import { neon } from "@neondatabase/serverless";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isPoolerHost,
  listMigrationFiles,
  migrationsDir,
  resolveUnpooledUrl,
  statementsForFile,
} from "../lib/server/migrate-sql";

function loadDotEnv(): void {
  const file = join(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

type Sql = {
  query?: (text: string, params?: unknown[]) => Promise<unknown>;
  (text: string, params?: unknown[]): Promise<unknown>;
};

function getSql(url: string): Sql {
  return neon(url, { fullResults: true }) as unknown as Sql;
}

async function run(sql: Sql, text: string, params: unknown[] = []): Promise<unknown> {
  return typeof sql.query === "function" ? sql.query(text, params) : sql(text, params);
}

async function q<T extends Record<string, unknown>>(sql: Sql, text: string, params: unknown[] = []): Promise<T[]> {
  const result = await run(sql, text, params);
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows || []) as T[];
}

async function exec(sql: Sql, text: string, params: unknown[] = []): Promise<void> {
  await run(sql, text, params);
}

async function ensureVersionTable(sql: Sql): Promise<void> {
  await exec(
    sql,
    `CREATE TABLE IF NOT EXISTS goose_db_version (
       id SERIAL PRIMARY KEY,
       version_id BIGINT NOT NULL,
       is_applied BOOLEAN NOT NULL,
       tstamp TIMESTAMP NULL DEFAULT now()
     )`,
  );
  const rows = await q<{ n: string }>(sql, `SELECT COUNT(*)::text AS n FROM goose_db_version`);
  if (Number(rows[0]?.n || 0) === 0) {
    await exec(sql, `INSERT INTO goose_db_version (version_id, is_applied) VALUES (0, TRUE)`);
  }
}

async function currentVersion(sql: Sql): Promise<number> {
  const rows = await q<{ version_id: string }>(
    sql,
    `SELECT version_id::text FROM goose_db_version WHERE is_applied = TRUE ORDER BY id DESC LIMIT 1`,
  );
  return Number(rows[0]?.version_id || 0);
}

async function adoptUsersBaseline(sql: Sql): Promise<void> {
  const tables = await q<{ exists: boolean }>(
    sql,
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'users'
     ) AS exists`,
  );
  if (!tables[0]?.exists) return;
  if ((await currentVersion(sql)) >= 1) return;
  await exec(sql, `INSERT INTO goose_db_version (version_id, is_applied) VALUES (1, TRUE)`);
}

async function appliedSet(sql: Sql): Promise<Set<number>> {
  const rows = await q<{ version_id: string }>(
    sql,
    `SELECT version_id::text FROM goose_db_version WHERE is_applied = TRUE AND version_id > 0`,
  );
  return new Set(rows.map((r) => Number(r.version_id)));
}

async function main(): Promise<void> {
  loadDotEnv();
  const statusOnly = process.argv.includes("--status");
  const dir = process.env.MIGRATIONS_DIR || migrationsDir();
  const files = listMigrationFiles(dir);
  const url = resolveUnpooledUrl();
  if (isPoolerHost(url)) {
    throw new Error("Use the Neon direct host for migrations, not the pooler");
  }
  const sql = getSql(url);
  await ensureVersionTable(sql);
  await adoptUsersBaseline(sql);
  const applied = await appliedSet(sql);
  const version = await currentVersion(sql);
  if (statusOnly) {
    console.log(`migrations dir ${dir}`);
    console.log(`current version ${version}`);
    for (const file of files) {
      console.log(`${applied.has(file.version) ? "applied" : "pending"} ${file.name}`);
    }
    return;
  }
  let ran = 0;
  for (const file of files) {
    if (applied.has(file.version)) continue;
    const statements = statementsForFile(file.path);
    for (const stmt of statements) {
      await exec(sql, stmt);
    }
    await exec(sql, `INSERT INTO goose_db_version (version_id, is_applied) VALUES ($1, TRUE)`, [file.version]);
    ran += 1;
    console.log(`applied ${file.name}`);
  }
  console.log(`migrate complete (${ran} new, current ${await currentVersion(sql)})`);
}

main().catch((err) => {
  console.error("migrate failed");
  console.error(err instanceof Error ? err.message : "error");
  process.exit(1);
});
