import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireMutating, requireOrganizerProfile } from "@/lib/server/guard";
import { revokeStaff } from "@/lib/server/staff";

export async function POST(req: NextRequest, { params }: { params: { id: string; staffId: string } }) {
  try {
    requireMutating(req);
    const { user, organizerProfileId } = await requireOrganizerProfile(req);
    const body = await readJson<{ reason?: string; expectedVersion?: number }>(req);
    await revokeStaff(organizerProfileId, params.id, params.staffId, user.id, String(body.reason || ""), Number(body.expectedVersion || 0));
    return jsonData({ ok: true }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
