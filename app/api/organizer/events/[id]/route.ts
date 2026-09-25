import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireMutating, requireOrganizerProfile } from "@/lib/server/guard";
import { deleteDraft, eventDto, getOwnedEvent, updateEvent, type OrgEvent } from "@/lib/server/events-organizer";
import { getSeatMap, listGalleryUrls, listSeats, listSections, listTicketRows, replaceGalleryUrls, ticketDto } from "@/lib/server/event-extras";
import { lifeDto, listEventLifecycle } from "@/lib/server/lifecycle";

async function detailPayload(orgId: string, id: string) {
  const e = await getOwnedEvent(orgId, id);
  const types = (await listTicketRows(id)).map(ticketDto);
  const gallery = await listGalleryUrls(id, String(e.category || ""), String(e.title || ""));
  const event = eventDto({ ...e, galleryUrls: gallery } as OrgEvent & { galleryUrls: string[] });
  const life = await listEventLifecycle(id);
  return {
    event,
    ticketTypes: types,
    sections: await listSections(id),
    seats: await listSeats(id),
    seatMap: await getSeatMap(id),
    image: null,
    version: e.version,
    lifecycleRequests: life.map(lifeDto),
  };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { organizerProfileId } = await requireOrganizerProfile(req);
    return jsonData(await detailPayload(organizerProfileId, params.id), 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireMutating(req);
    const { organizerProfileId } = await requireOrganizerProfile(req);
    const body = await readJson<Record<string, unknown>>(req);
    const e = await updateEvent(organizerProfileId, params.id, body, Number(body.expectedVersion || 0));
    if (Array.isArray(body.galleryUrls)) {
      await replaceGalleryUrls(params.id, body.galleryUrls as string[]);
    }
    return jsonData({ event: eventDto(e), version: e.version }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireMutating(req);
    const { organizerProfileId } = await requireOrganizerProfile(req);
    const body = await readJson<{ expectedVersion?: number }>(req);
    await deleteDraft(organizerProfileId, params.id, Number(body.expectedVersion || 0));
    return new Response(null, { status: 204 });
  } catch (err) {
    return jsonError(err, req);
  }
}
