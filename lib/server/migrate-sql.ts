/**
 * Parser and apply helpers for goose SQL files under /migrations.
 * Table goose_db_version stays compatible with the previous Go/goose runner.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function migrationsDir(root = process.cwd()): string {
  return join(root, "migrations");
}

export function extractGooseUp(sql: string): string {
  const upIdx = sql.indexOf("-- +goose Up");
  if (upIdx < 0) return sql;
  const downIdx = sql.indexOf("-- +goose Down", upIdx);
  return downIdx < 0 ? sql.slice(upIdx) : sql.slice(upIdx, downIdx);
}

export function splitGooseStatements(upSql: string): string[] {
  const stmts: string[] = [];
  let buf = "";
  let inBegin = false;
  for (const line of upSql.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "-- +goose StatementBegin") {
      inBegin = true;
      continue;
    }
    if (trimmed === "-- +goose StatementEnd") {
      inBegin = false;
      const chunk = buf.trim();
      if (chunk) stmts.push(chunk);
      buf = "";
      continue;
    }
    if (trimmed.startsWith("-- +goose")) continue;
    buf += `${line}\n`;
    if (!inBegin && /;\s*$/.test(line)) {
      const chunk = buf.trim();
      if (chunk) stmts.push(chunk);
      buf = "";
    }
  }
  const rest = buf.trim();
  if (rest) stmts.push(rest);
  return stmts;
}

export type MigrationFile = { version: number; name: string; path: string };

export function listMigrationFiles(dir: string): MigrationFile[] {
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
  const out: MigrationFile[] = [];
  let prev = 0;
  for (const name of files) {
    const version = Number(name.slice(0, 4));
    if (!Number.isInteger(version) || version !== prev + 1) {
      throw new Error(`non-sequential goose file ${name}`);
    }
    prev = version;
    out.push({ version, name, path: join(dir, name) });
  }
  return out;
}

export function statementsForFile(path: string): string[] {
  const body = readFileSync(path, "utf8");
  return splitGooseStatements(extractGooseUp(body));
}

export function isPoolerHost(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl.replace(/^postgres(ql)?:/i, "http:")).hostname.toLowerCase();
    return host.includes("-pooler.") || host.includes(".pooler.");
  } catch {
    return false;
  }
}

export function resolveUnpooledUrl(): string {
  const direct = String(process.env.DATABASE_URL_UNPOOLED || "").trim();
  const pooled = String(process.env.DATABASE_URL || "").trim();
  const url = direct || pooled;
  if (!url) {
    throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required");
  }
  if (isPoolerHost(url)) {
    throw new Error("Use the Neon direct host for migrations, not the pooler");
  }
  return url;
}
