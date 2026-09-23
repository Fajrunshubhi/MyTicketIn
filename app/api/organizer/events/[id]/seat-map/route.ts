import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireMutating, requireOrganizerProfile } from "@/lib/server/guard";
import { saveSeatMap } from "@/lib/server/event-extras";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireMutating(req);
    const { organizerProfileId } = await requireOrganizerProfile(req);
    const body = await readJson<{ expectedVersion?: number; altText?: string; legend?: string }>(req);
    await saveSeatMap(organizerProfileId, params.id, String(body.altText || ""), String(body.legend || ""), Number(body.expectedVersion || 0));
    return jsonData({ ok: true }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
