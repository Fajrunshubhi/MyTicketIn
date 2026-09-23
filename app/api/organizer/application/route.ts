import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { readJson, requireAuth, requireMutating } from "@/lib/server/guard";
import { editApplication, getByOwner, ownerDto } from "@/lib/server/organizers";
import { AppError } from "@/lib/server/http";

export const GET = routeHandler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const p = await getByOwner(user.id);
  if (!p) throw new AppError("ORGANIZER_APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
  return jsonData(ownerDto(p), 200, req);
});

export const PATCH = routeHandler(async (req: NextRequest) => {
  requireMutating(req);
  const user = await requireAuth(req);
  const body = await readJson<{
    name?: string;
    contactEmail?: string;
    contactPhone?: string | null;
    description?: string;
    expectedVersion?: number;
  }>(req);
  const p = await editApplication(user, {
    name: body.name || "",
    contactEmail: body.contactEmail || "",
    contactPhone: body.contactPhone,
    description: body.description || "",
    expectedVersion: Number(body.expectedVersion || 0),
  });
  return jsonData(ownerDto(p), 200, req);
});
