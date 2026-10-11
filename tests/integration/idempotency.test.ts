import { beforeAll, describe, expect, it } from "vitest";
import { execute, query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import { withIdempotency } from "@/lib/server/idempotency";
import { idem, seedUser } from "./helpers";

let actor: AuthUser;

beforeAll(async () => {
  actor = await seedUser("idemactor");
});

const opts = (key: string | null, request: unknown = { a: 1 }, actorId = actor.id) => ({
  scope: "REQUEST_PAYOUT" as const,
  actorUserId: actorId,
  key,
  request,
  resourceType: "Test",
  resourceId: (r: unknown) => String((r as { id: string }).id),
});

describe("withIdempotency", () => {
  it("runs once and replays the stored result for the same key and payload", async () => {
    const key = idem();
    let runs = 0;
    const run = async () => ({ id: `res-${++runs}` });
    const first = await withIdempotency(opts(key), run);
    const second = await withIdempotency(opts(key), run);
    expect(first).toEqual({ value: { id: "res-1" }, replay: false });
    expect(second).toEqual({ value: { id: "res-1" }, replay: true });
    expect(runs).toBe(1);
  });

  it("rejects the same key with a different payload", async () => {
    const key = idem();
    await withIdempotency(opts(key, { a: 1 }), async () => ({ id: "x" }));
    await expect(withIdempotency(opts(key, { a: 2 }), async () => ({ id: "y" }))).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      status: 409,
    });
  });

  it("scopes keys per actor", async () => {
    const key = idem();
    const other = await seedUser("idemother");
    await withIdempotency(opts(key), async () => ({ id: "mine" }));
    const theirs = await withIdempotency(opts(key, { a: 1 }, other.id), async () => ({ id: "theirs" }));
    expect(theirs).toEqual({ value: { id: "theirs" }, replay: false });
  });

  it("releases the claim when the operation fails so the client can retry", async () => {
    const key = idem();
    await expect(
      withIdempotency(opts(key), async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const retry = await withIdempotency(opts(key), async () => ({ id: "ok" }));
    expect(retry).toEqual({ value: { id: "ok" }, replay: false });
  });

  it("executes only once when the same key arrives concurrently", async () => {
    const key = idem();
    let runs = 0;
    const run = async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 300));
      return { id: "once" };
    };
    const results = await Promise.allSettled([withIdempotency(opts(key), run), withIdempotency(opts(key), run), withIdempotency(opts(key), run)]);
    expect(runs).toBe(1);
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(failed.every((r) => (r.reason as { code?: string }).code === "IDEMPOTENCY_IN_PROGRESS")).toBe(true);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("does not replay an expired record and validates key length", async () => {
    const key = idem();
    await withIdempotency(opts(key), async () => ({ id: "old" }));
    await execute(
      `UPDATE idempotency_keys SET created_at = created_at - INTERVAL '25 hours', expires_at = expires_at - INTERVAL '25 hours'
       WHERE actor_user_id=$1 AND scope='REQUEST_PAYOUT'`,
      [actor.id],
    );
    const fresh = await withIdempotency(opts(key), async () => ({ id: "new" }));
    expect(fresh).toEqual({ value: { id: "new" }, replay: false });

    await expect(withIdempotency(opts("short"), async () => ({ id: "z" }))).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_INVALID" });
    // Tanpa kunci operasi tetap berjalan; perlindungan ada pada guard operasinya sendiri.
    expect(await withIdempotency(opts(null), async () => ({ id: "nokey" }))).toEqual({ value: { id: "nokey" }, replay: false });
    const left = await query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM idempotency_keys WHERE actor_user_id=$1 AND status='PROCESSING'`, [actor.id]);
    expect(Number(left[0].n)).toBe(0);
  });
});
