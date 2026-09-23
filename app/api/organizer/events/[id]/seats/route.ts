import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireMutating, requireOrganizerProfile } from "@/lib/server/guard";
import { putSeats } from "@/lib/server/event-extras";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireMutating(req);
    const { organizerProfileId } = await requireOrganizerProfile(req);
    const body = await readJson<{ expectedVersion?: number; seats?: { sectionId: string; label: string }[] }>(req);
    await putSeats(organizerProfileId, params.id, body.seats || [], Number(body.expectedVersion || 0));
    return jsonData({ ok: true }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
