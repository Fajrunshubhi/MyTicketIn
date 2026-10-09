import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireAdmin, requireMutating } from "@/lib/server/guard";
import { decideChange } from "@/lib/server/organizer-changes";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireMutating(req);
    const admin = await requireAdmin(req);
    const body = await readJson<{ decision?: string; reason?: string }>(req);
    return jsonData(await decideChange(admin, params.id, body.decision || "", body.reason || ""), 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
