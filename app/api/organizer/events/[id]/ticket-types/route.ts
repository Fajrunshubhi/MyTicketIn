import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireMutating, requireOrganizerProfile } from "@/lib/server/guard";
import { addTicket } from "@/lib/server/events-organizer";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireMutating(req);
    const { organizerProfileId } = await requireOrganizerProfile(req);
    const body = await readJson<Record<string, unknown>>(req);
    const t = await addTicket(organizerProfileId, params.id, body);
    return jsonData({ ticketType: t }, 201, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
