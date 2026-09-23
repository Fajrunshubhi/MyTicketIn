import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireOrganizerProfile } from "@/lib/server/guard";
import { searchStaffCandidates } from "@/lib/server/staff";

export const GET = routeHandler(async (req: NextRequest) => {
  await requireOrganizerProfile(req);
  const items = await searchStaffCandidates(req.nextUrl.searchParams.get("q") || "");
  return jsonData({ items }, 200, req);
});
