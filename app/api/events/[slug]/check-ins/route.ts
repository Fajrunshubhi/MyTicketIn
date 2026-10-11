import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireAuth, requireMutating } from "@/lib/server/guard";
import { checkIn } from "@/lib/server/checkin";
import { hitRateLimit } from "@/lib/server/rate-limit";

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    requireMutating(req);
    const user = await requireAuth(req);
    const body = await readJson<{ inputType?: string; value?: string }>(req);
    // Per-operator limits slow down brute-forcing manual codes; QR scans get a roomier budget.
    const manual = /^MANUAL/i.test(String(body.inputType || ""));
    await hitRateLimit(manual ? "checkin-manual" : "checkin-qr", user.id, manual ? 30 : 120, 60);
    const out = await checkIn(user, params.slug, body, req.headers.get("idempotency-key") || "");
    return jsonData(out, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
