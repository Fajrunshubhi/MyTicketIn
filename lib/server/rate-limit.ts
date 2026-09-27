import { AppError, query, tokenHash } from "@/lib/server/http";

export async function hitRateLimit(scope: string, key: string, max: number, windowSeconds: number): Promise<number> {
  const keyHash = tokenHash(`${scope}|${key}`);
  const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const rows = await query<{ attempt_count: number }>(
    `INSERT INTO auth_rate_limits (key_hash, scope, window_started_at, attempt_count, updated_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP)
     ON CONFLICT (key_hash) DO UPDATE SET
       attempt_count = CASE
         WHEN auth_rate_limits.window_started_at > $3::timestamptz THEN auth_rate_limits.attempt_count + 1
         ELSE 1
       END,
       window_started_at = CASE
         WHEN auth_rate_limits.window_started_at > $3::timestamptz THEN auth_rate_limits.window_started_at
         ELSE CURRENT_TIMESTAMP
       END,
       updated_at = CURRENT_TIMESTAMP
     RETURNING attempt_count`,
    [keyHash, scope, cutoff],
  );
  const n = Number(rows[0]?.attempt_count || 1);
  if (n > max) throw new AppError("RATE_LIMITED", "Terlalu banyak permintaan.", {}, 429);
  return n;
}

export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  const forwarded = String(req.headers.get("x-forwarded-for") || "")
    .split(",")[0]
    .trim();
  return forwarded || String(req.headers.get("x-real-ip") || "").trim() || "0.0.0.0";
}
