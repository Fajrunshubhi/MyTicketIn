import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireMutating, requireOrganizerProfile } from "@/lib/server/guard";
import { updateTicket } from "@/lib/server/event-extras";

export async function PATCH(req: NextRequest, { params }: { params: { id: string; ticketTypeId: string } }) {
  try {
    requireMutating(req);
    const { organizerProfileId } = await requireOrganizerProfile(req);
    const body = await readJson<Record<string, unknown>>(req);
    const ticketType = await updateTicket(organizerProfileId, params.id, params.ticketTypeId, body);
    return jsonData({ ticketType }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
