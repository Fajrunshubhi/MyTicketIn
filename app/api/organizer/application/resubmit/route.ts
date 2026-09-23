import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { readJson, requireAuth, requireMutating } from "@/lib/server/guard";
import { ownerDto, resubmitApplication } from "@/lib/server/organizers";

export const POST = routeHandler(async (req: NextRequest) => {
  requireMutating(req);
  const user = await requireAuth(req);
  const body = await readJson<{ expectedVersion?: number }>(req);
  const p = await resubmitApplication(user, Number(body.expectedVersion || 0));
  return jsonData(ownerDto(p), 200, req);
});
