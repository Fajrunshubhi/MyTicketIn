import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireMutating, requireOrganizerProfile } from "@/lib/server/guard";
import { deleteTicket, updateTicket } from "@/lib/server/event-extras";

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

export async function DELETE(req: NextRequest, { params }: { params: { id: string; ticketTypeId: string } }) {
  try {
    requireMutating(req);
    const { organizerProfileId } = await requireOrganizerProfile(req);
    const body = (await readJson<Record<string, unknown>>(req).catch(() => ({}))) as Record<string, unknown>;
    await deleteTicket(organizerProfileId, params.id, params.ticketTypeId, Number(body.expectedVersion || 0));
    return new Response(null, { status: 204 });
  } catch (err) {
    return jsonError(err, req);
  }
}
