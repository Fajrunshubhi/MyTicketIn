import { createHash } from "crypto";
import { AppError, newId, query, tokenHash } from "@/lib/server/http";

export type IdempotencyScope = "REQUEST_PAYOUT";

type Options = {
  scope: IdempotencyScope;
  actorUserId: string;
  /** Raw `Idempotency-Key` header. Missing means "no replay protection requested"; the operation's own guards still apply. */
  key: string | null | undefined;
  /** Everything that defines the request; the same key with a different payload is rejected. */
  request: unknown;
  resourceType: string;
  resourceId: (result: unknown) => string;
};

type Claim = { id: string; status: string; request_hash: string; response_body: unknown; http_status: number | null };

/**
 * Runs `run` at most once per (actor, scope, key) for 24 hours and replays the stored result afterwards.
 * Neon HTTP has no multi-statement transactions, so the claim is a unique-key insert; a failed run releases the
 * claim so the client can retry, while a crash leaves PROCESSING until expiry (reported as in progress).
 */
export async function withIdempotency<T>(opts: Options, run: () => Promise<T>): Promise<{ value: T; replay: boolean }> {
  const raw = (opts.key || "").trim();
  if (!raw) return { value: await run(), replay: false };
  if (raw.length < 16 || raw.length > 128) {
    throw new AppError("IDEMPOTENCY_KEY_INVALID", "Idempotency-Key wajib 16–128 karakter.", {}, 400);
  }
  const keyHash = tokenHash(raw);
  const requestHash = createHash("sha256").update(JSON.stringify(opts.request ?? null)).digest("hex");

  // An expired record must not replay forever.
  await query(
    `DELETE FROM idempotency_keys WHERE actor_user_id=$1 AND scope=$2 AND key_hash=$3 AND expires_at <= transaction_timestamp()`,
    [opts.actorUserId, opts.scope, keyHash],
  );
  const claimId = newId();
  const inserted = await query<{ id: string }>(
    `INSERT INTO idempotency_keys (id, actor_user_id, scope, key_hash, request_hash, status, expires_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,'PROCESSING'::idempotency_status, transaction_timestamp() + INTERVAL '24 hours', transaction_timestamp(), transaction_timestamp())
     ON CONFLICT (actor_user_id, scope, key_hash) DO NOTHING
     RETURNING id`,
    [claimId, opts.actorUserId, opts.scope, keyHash, requestHash],
  );

  if (!inserted[0]) {
    const rows = await query<Claim>(
      `SELECT id, status::text AS status, request_hash, response_body, http_status FROM idempotency_keys
       WHERE actor_user_id=$1 AND scope=$2 AND key_hash=$3 LIMIT 1`,
      [opts.actorUserId, opts.scope, keyHash],
    );
    const rec = rows[0];
    if (rec && rec.request_hash !== requestHash) {
      throw new AppError("IDEMPOTENCY_KEY_REUSED", "Kunci idempotensi dipakai ulang.", {}, 409);
    }
    if (rec?.status === "COMPLETED") return { value: rec.response_body as T, replay: true };
    throw new AppError("IDEMPOTENCY_IN_PROGRESS", "Permintaan yang sama sedang diproses. Coba lagi sebentar.", {}, 409);
  }

  let value: T;
  try {
    value = await run();
  } catch (err) {
    await query(`DELETE FROM idempotency_keys WHERE id=$1 AND status='PROCESSING'::idempotency_status`, [claimId]);
    throw err;
  }
  await query(
    `UPDATE idempotency_keys SET status='COMPLETED'::idempotency_status, resource_type=$2, resource_id=$3,
            http_status=201, response_body=$4::jsonb, updated_at=transaction_timestamp()
     WHERE id=$1`,
    [claimId, opts.resourceType, opts.resourceId(value), JSON.stringify(value)],
  );
  return { value, replay: false };
}
