import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { requireOrganizerProfile } from "@/lib/server/guard";
import { getOwnedEvent } from "@/lib/server/events-organizer";
import { listParticipants } from "@/lib/server/reporting";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { organizerProfileId } = await requireOrganizerProfile(req);
    await getOwnedEvent(organizerProfileId, params.id);
    const items = await listParticipants(organizerProfileId, params.id);
    return jsonData({ items, total: items.length }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
