import { NextRequest } from "next/server";
import { AppError, jsonData, routeHandler } from "@/lib/server/http";
import { requireAuth, requireMutating } from "@/lib/server/guard";
import { getByOwner } from "@/lib/server/organizers";
import { cancelChange, changeDto, ownerChangeView, submitChange } from "@/lib/server/organizer-changes";
import { parseApplicationForm } from "@/lib/server/organizer-application-form";
import { hitRateLimit } from "@/lib/server/rate-limit";

export const GET = routeHandler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const p = await getByOwner(user.id);
  if (!p) throw new AppError("ORGANIZER_APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
  return jsonData(await ownerChangeView(p.id), 200, req);
});

export const POST = routeHandler(async (req: NextRequest) => {
  requireMutating(req);
  const user = await requireAuth(req);
  await hitRateLimit("organizer", `change:${user.id}`, 10, 3600);
  const { body, files } = await parseApplicationForm(req);
  const row = await submitChange(user, body, files);
  const view = await ownerChangeView(row.organizer_profile_id);
  return jsonData(view.pending ?? changeDto(row, { hasKtp: false, hasSelfie: false }), 201, req);
});

export const DELETE = routeHandler(async (req: NextRequest) => {
  requireMutating(req);
  const user = await requireAuth(req);
  await cancelChange(user);
  return jsonData({ cancelled: true }, 200, req);
});
