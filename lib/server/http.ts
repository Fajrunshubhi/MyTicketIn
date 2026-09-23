import { randomBytes, createHash } from "crypto";
import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";
import { errorCatalog, lookupError } from "@/lib/errors/error-catalog";

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fieldErrors: Record<string, string>;

  constructor(code: string, message?: string, fieldErrors: Record<string, string> = {}, status?: number) {
    const entry = lookupError(code);
    super(message || entry.message);
    this.code = code;
    this.status = status ?? (errorCatalog[code] ? entry.status : 400);
    this.fieldErrors = fieldErrors;
  }
}

export function newId(): string {
  return randomBytes(16).toString("hex");
}

export function tokenHash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function randomToken(): string {
  return randomBytes(32).toString("hex");
}

export function correlationId(req?: NextRequest): string {
  const raw = req?.headers.get("x-correlation-id") || "";
  if (/^req_[A-Za-z0-9_-]{8,128}$/.test(raw)) return raw;
  return `req_${randomBytes(16).toString("hex")}`;
}

export function hasDatabaseUrl(): boolean {
  return /^(postgres|postgresql):\/\//i.test(String(process.env.DATABASE_URL || ""));
}

type QueryFn = {
  query?: (text: string, params?: unknown[]) => Promise<unknown>;
  (text: string, params?: unknown[]): Promise<unknown>;
};

export function getSql(): QueryFn {
  if (!hasDatabaseUrl()) {
    throw new AppError("SERVICE_UNHEALTHY", "Layanan tidak siap.", {}, 503);
  }
  return neon(process.env.DATABASE_URL as string, {
    fullResults: true,
    fetchOptions: { cache: "no-store" },
  }) as unknown as QueryFn;
}

export async function execute(text: string, params: unknown[] = []): Promise<number> {
  const sql = getSql();
  let result: unknown;
  try {
    result = typeof sql.query === "function" ? await sql.query(text, params) : await sql(text, params);
  } catch (err) {
    mapDbError(err);
  }
  if (result && typeof result === "object" && "rowCount" in (result as object)) {
    return Number((result as { rowCount?: number }).rowCount || 0);
  }
  if (Array.isArray(result)) return result.length;
  return 0;
}

function mapDbError(err: unknown): never {
  const e = err as { code?: string; detail?: string; hint?: string; sourceError?: { code?: string; message?: string } };
  const blob = `${e.code || ""} ${e.sourceError?.code || ""} ${(err as Error).message || ""} ${e.detail || ""} ${e.hint || ""} ${e.sourceError?.message || ""}`.toLowerCase();
  if (blob.includes("users_username") || blob.includes("username_key")) {
    throw new AppError("USERNAME_ALREADY_EXISTS", "Username sudah digunakan.", {}, 409);
  }
  if (blob.includes("users_email") || blob.includes("email_key")) {
    throw new AppError("EMAIL_ALREADY_EXISTS", "Email sudah terdaftar.", {}, 409);
  }
  if (blob.includes("events_slug_key") || blob.includes("events_slug")) {
    throw new AppError("EVENT_SLUG_CONFLICT", "Slug event sudah dipakai.", {}, 409);
  }
  if (blob.includes("event_ticket_types_event_name") || blob.includes("ticket_types_event_name")) {
    throw new AppError("TICKET_TYPE_NAME_EXISTS", "Nama jenis tiket sudah dipakai di event ini.", {}, 409);
  }
  if (blob.includes("23503") || blob.includes("foreign key")) {
    throw new AppError("VALIDATION_ERROR", "Referensi data tidak valid.", {}, 400);
  }
  if (blob.includes("22p02") || blob.includes("invalid input value for enum")) {
    throw new AppError("VALIDATION_ERROR", "Nilai status tidak valid.", {}, 400);
  }
  if (
    blob.includes("23514") ||
    blob.includes("check constraint") ||
    blob.includes("events_email_chk") ||
    blob.includes("events_desc_len") ||
    blob.includes("events_time_chk") ||
    blob.includes("events_decision") ||
    blob.includes("events_publish") ||
    blob.includes("events_cancel") ||
    blob.includes("events_complete") ||
    blob.includes("organizer_profiles_decision") ||
    blob.includes("organizer_profiles_email") ||
    blob.includes("payments_terminal") ||
    blob.includes("tickets_status_fields") ||
    blob.includes("event_ticket_types_sale") ||
    blob.includes("event_staff_assignments_state")
  ) {
    throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", {}, 400);
  }
  throw err;
}

export async function query<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const sql = getSql();
  let result: unknown;
  try {
    result = typeof sql.query === "function" ? await sql.query(text, params) : await sql(text, params);
  } catch (err) {
    mapDbError(err);
  }
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown[] }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

export async function pingDatabase(): Promise<boolean> {
  try {
    const rows = await query<{ one: number }>("SELECT 1 AS one");
    return rows.length > 0;
  } catch {
    return false;
  }
}

export function jsonOk(data: unknown, status = 200, extra?: HeadersInit, req?: NextRequest): NextResponse {
  const id = correlationId(req);
  const extraHeaders = Object.fromEntries(new Headers(extra || {}).entries());
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": extraHeaders["cache-control"] || extraHeaders["Cache-Control"] || "private, no-store",
      "X-Correlation-Id": id,
      ...extraHeaders,
    },
  });
}

export function jsonData(data: unknown, status = 200, req?: NextRequest): NextResponse {
  return jsonOk({ data }, status, undefined, req);
}

export function jsonPublic(data: unknown, sMaxAge: number, swr: number, req?: NextRequest): NextResponse {
  const id = correlationId(req);
  const payload = JSON.stringify(data);
  const etag = createHash("sha256").update(payload).digest("hex").slice(0, 16);
  return new NextResponse(payload, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
      ETag: `"${etag}"`,
      "X-Correlation-Id": id,
    },
  });
}

export function jsonError(err: unknown, req?: NextRequest): NextResponse {
  if (!(err instanceof AppError)) {
    try {
      mapDbError(err);
    } catch (mapped) {
      if (mapped instanceof AppError) return jsonError(mapped, req);
    }
  }
  const id = correlationId(req);
  if (err instanceof AppError) {
    const entry = lookupError(err.code);
    return NextResponse.json(
      {
        error: {
          code: err.code,
          message: err.message || entry.message,
          correlationId: id,
          fieldErrors: err.fieldErrors,
        },
      },
      {
        status: err.status || entry.status,
        headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": id },
      },
    );
  }
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan internal.", correlationId: id, fieldErrors: {} } },
    { status: 500, headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": id } },
  );
}

export function routeHandler(
  fn: (req: NextRequest, ctx: { params?: Record<string, string> }) => Promise<NextResponse>,
) {
  return async (req: NextRequest, ctx?: { params?: Record<string, string> }) => {
    try {
      return await fn(req, ctx || {});
    } catch (err) {
      return jsonError(err, req);
    }
  };
}

export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "";
  return req.headers.get("x-real-ip") || "";
}

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const COOKIE_SESSION = "mti_session";
export const COOKIE_CSRF = "mti_csrf";
