import { NextRequest } from "next/server";
import { jsonOk, routeHandler } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/guard";
import { listAdmin, listDto } from "@/lib/server/organizers";
import { correlationId } from "@/lib/server/http";

export const GET = routeHandler(async (req: NextRequest) => {
  await requireAdmin(req);
  const q = req.nextUrl.searchParams;
  const rows = await listAdmin(q.get("status") || "", q.get("q") || "", Number(q.get("limit") || 25));
  return jsonOk({ data: rows.map(listDto), page: { nextCursor: "" }, correlationId: correlationId(req) }, 200, undefined, req);
});
