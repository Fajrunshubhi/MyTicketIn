import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireMutating, requireOrganizerProfile } from "@/lib/server/guard";
import { updatePromo } from "@/lib/server/promo";

export async function PATCH(req: NextRequest, { params }: { params: { id: string; codeId: string } }) {
  try {
    requireMutating(req);
    const { organizerProfileId } = await requireOrganizerProfile(req);
    const body = await readJson<{ status?: unknown; endsAt?: unknown; maxRedemptions?: unknown }>(req);
    return jsonData({ promo: await updatePromo(organizerProfileId, params.id, params.codeId, body) }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
