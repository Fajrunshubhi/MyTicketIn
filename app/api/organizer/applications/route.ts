import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireAuth, requireMutating } from "@/lib/server/guard";
import { ownerDto, submitApplication } from "@/lib/server/organizers";
import { parseApplicationForm } from "@/lib/server/organizer-application-form";
import { hitRateLimit } from "@/lib/server/rate-limit";

export const POST = routeHandler(async (req: NextRequest) => {
  requireMutating(req);
  const user = await requireAuth(req);
  await hitRateLimit("organizer", `apply:${user.id}`, 10, 3600);
  const { body, files } = await parseApplicationForm(req);
  const p = await submitApplication(user, body, files);
  return jsonData({ ...ownerDto(p), hasKtp: true, hasSelfie: true }, 201, req);
});
