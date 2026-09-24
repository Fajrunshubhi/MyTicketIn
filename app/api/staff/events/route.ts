import { NextRequest } from "next/server";
import { AppError, jsonData, routeHandler } from "@/lib/server/http";
import { requireAuthAccess } from "@/lib/server/guard";
import { listAssignedEvents } from "@/lib/server/staff-accounts";

export const GET = routeHandler(async (req: NextRequest) => {
  const { user, acc } = await requireAuthAccess(req);
  if (acc.kind !== "staff") throw new AppError("FORBIDDEN", "Anda tidak memiliki akses.", {}, 403);
  const items = await listAssignedEvents(user.id);
  return jsonData(
    {
      items: items.map((row) => ({
        id: row.id,
        title: row.title,
        startsAt: row.starts_at,
        venueName: row.venue_name,
      })),
    },
    200,
    req,
  );
});
