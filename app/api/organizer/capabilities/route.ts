import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/guard";
import { getByOwner } from "@/lib/server/organizers";

export const GET = routeHandler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const p = await getByOwner(user.id);
  return jsonData(
    {
      organizerProfileId: p?.id || "",
      status: p?.status || "",
      canManageOrganizerResources: p?.status === "APPROVED",
    },
    200,
    req,
  );
});
