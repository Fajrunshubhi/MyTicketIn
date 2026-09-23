import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/guard";
import { eventDto, listAdminEvents } from "@/lib/server/events-organizer";
import { correlationId } from "@/lib/server/http";

export const GET = async (req: NextRequest) => {
  try {
    await requireAdmin(req);
    const q = req.nextUrl.searchParams;
    const rows = await listAdminEvents(q.get("status") || "PENDING_REVIEW", Number(q.get("limit") || 25));
    return jsonOk({ data: { items: rows.map(eventDto) }, correlationId: correlationId(req) }, 200, undefined, req);
  } catch (err) {
    return jsonError(err, req);
  }
};
