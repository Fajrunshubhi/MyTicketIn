import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { requireOrganizerProfile } from "@/lib/server/guard";
import { getOwnedEvent } from "@/lib/server/events-organizer";
import { listParticipants, PARTICIPANT_STATUSES } from "@/lib/server/reporting";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { organizerProfileId } = await requireOrganizerProfile(req);
    await getOwnedEvent(organizerProfileId, params.id);
    const raw = (new URL(req.url).searchParams.get("status") || "").toUpperCase();
    const status = (PARTICIPANT_STATUSES as readonly string[]).includes(raw) ? raw : undefined;
    const items = await listParticipants(organizerProfileId, params.id, status);
    return jsonData({ items, total: items.length }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
