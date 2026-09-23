import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { readJson, requireAuth, requireMutating } from "@/lib/server/guard";
import { ownerDto, submitApplication } from "@/lib/server/organizers";

export const POST = routeHandler(async (req: NextRequest) => {
  requireMutating(req);
  const user = await requireAuth(req);
  const body = await readJson<{ name?: string; contactEmail?: string; contactPhone?: string | null; description?: string }>(req);
  const p = await submitApplication(user, {
    name: body.name || "",
    contactEmail: body.contactEmail || "",
    contactPhone: body.contactPhone,
    description: body.description || "",
  });
  return jsonData(ownerDto(p), 201, req);
});
