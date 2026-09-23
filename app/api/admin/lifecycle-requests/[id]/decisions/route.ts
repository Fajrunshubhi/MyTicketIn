import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireAdmin, requireMutating } from "@/lib/server/guard";
import { decideLifecycle, lifeDto } from "@/lib/server/lifecycle";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireMutating(req);
    const admin = await requireAdmin(req);
    const body = await readJson<{ decision?: string; reason?: string }>(req);
    const row = await decideLifecycle(admin.id, params.id, String(body.decision || ""), String(body.reason || ""));
    return jsonData({ request: lifeDto(row) }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
