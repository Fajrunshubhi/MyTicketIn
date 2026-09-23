import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireMutating, requireOrganizerProfile } from "@/lib/server/guard";
import { eventDto } from "@/lib/server/events-organizer";
import { completeEvent } from "@/lib/server/event-extras";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireMutating(req);
    const { organizerProfileId } = await requireOrganizerProfile(req);
    const body = await readJson<{ expectedVersion?: number }>(req);
    const e = await completeEvent(organizerProfileId, params.id, Number(body.expectedVersion || 0));
    return jsonData({ event: eventDto(e) }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
