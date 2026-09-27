import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { readJson, requireAuth, requireMutating } from "@/lib/server/guard";
import { appealSuspension, ownerDto } from "@/lib/server/organizers";

export const POST = routeHandler(async (req: NextRequest) => {
  requireMutating(req);
  const user = await requireAuth(req);
  const body = await readJson<{ reason?: string; expectedVersion?: number }>(req);
  const p = await appealSuspension(user, String(body.reason || ""), Number(body.expectedVersion || 0));
  return jsonData(ownerDto(p), 200, req);
});
