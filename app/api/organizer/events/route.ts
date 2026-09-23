import { NextRequest } from "next/server";
import { jsonData, jsonOk, routeHandler } from "@/lib/server/http";
import { readJson, requireMutating, requireOrganizerProfile } from "@/lib/server/guard";
import { createEvent, eventDto, listOrganizerEvents } from "@/lib/server/events-organizer";
import { correlationId } from "@/lib/server/http";
import { replaceGalleryUrls } from "@/lib/server/event-extras";

export const GET = routeHandler(async (req: NextRequest) => {
  const { organizerProfileId } = await requireOrganizerProfile(req);
  const q = req.nextUrl.searchParams;
  const rows = await listOrganizerEvents(organizerProfileId, q.get("status") || "", Number(q.get("limit") || 25));
  return jsonOk(
    { data: { items: rows.map(eventDto), nextCursor: "" }, correlationId: correlationId(req) },
    200,
    undefined,
    req,
  );
});

export const POST = routeHandler(async (req: NextRequest) => {
  requireMutating(req);
  const { organizerProfileId } = await requireOrganizerProfile(req);
  const body = await readJson<Record<string, unknown>>(req);
  const e = await createEvent(organizerProfileId, body);
  if (Array.isArray(body.galleryUrls)) {
    await replaceGalleryUrls(e.id, body.galleryUrls as string[]);
  }
  return jsonData({ event: { id: e.id, slug: e.slug, status: e.status, version: e.version } }, 201, req);
});
