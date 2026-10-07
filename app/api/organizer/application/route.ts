import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireAuth, requireMutating } from "@/lib/server/guard";
import { editApplication, getByOwner, listHistory, ownerDto } from "@/lib/server/organizers";
import { documentFlags } from "@/lib/server/organizer-documents";
import { parseApplicationForm } from "@/lib/server/organizer-application-form";
import { hitRateLimit } from "@/lib/server/rate-limit";
import { AppError } from "@/lib/server/http";

export const GET = routeHandler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const p = await getByOwner(user.id);
  if (!p) throw new AppError("ORGANIZER_APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
  return jsonData({ ...ownerDto(p), ...(await documentFlags(p.id)), history: await listHistory(p.id) }, 200, req);
});

export const PATCH = routeHandler(async (req: NextRequest) => {
  requireMutating(req);
  const user = await requireAuth(req);
  await hitRateLimit("organizer", `apply:${user.id}`, 10, 3600);
  const { body, files } = await parseApplicationForm(req);
  const p = await editApplication(user, body, files);
  return jsonData({ ...ownerDto(p), ...(await documentFlags(p.id)) }, 200, req);
});
