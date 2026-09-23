import { NextRequest } from "next/server";
import { jsonOk, routeHandler } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/guard";
import { listAuditLogs } from "@/lib/server/audit";
import { correlationId } from "@/lib/server/http";

export const GET = routeHandler(async (req: NextRequest) => {
  await requireAdmin(req);
  const data = await listAuditLogs(req.nextUrl.searchParams);
  return jsonOk({ data, page: { nextCursor: "" }, correlationId: correlationId(req) }, 200, undefined, req);
});
