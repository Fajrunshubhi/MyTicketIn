import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { listApprovedOrganizers } from "@/lib/server/staff-accounts";

export const GET = routeHandler(async (req: NextRequest) => {
  const items = await listApprovedOrganizers();
  return jsonData({ items }, 200, req);
});
