import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireAdmin, requireMutating } from "@/lib/server/guard";
import { eventDto } from "@/lib/server/events-organizer";
import { cancelEventByAdmin } from "@/lib/server/event-extras";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireMutating(req);
    const admin = await requireAdmin(req);
    const body = await readJson<{ reason?: string; expectedVersion?: number }>(req);
    const e = await cancelEventByAdmin(params.id, String(body.reason || ""), Number(body.expectedVersion || 0), admin.id);
    return jsonData({ event: eventDto(e) }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
