import { NextRequest } from "next/server";
import { correlationId, jsonData, routeHandler } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/guard";
import { adminSearch, parseAdminSearch } from "@/lib/server/admin-search";

export const GET = routeHandler(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const input = parseAdminSearch(req.nextUrl.searchParams);
  return jsonData(await adminSearch(admin.id, input, correlationId(req)), 200, req);
});
