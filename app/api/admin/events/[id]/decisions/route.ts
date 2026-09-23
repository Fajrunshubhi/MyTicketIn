import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireAdmin, requireMutating } from "@/lib/server/guard";
import { decideEvent, eventDto } from "@/lib/server/events-organizer";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireMutating(req);
    const admin = await requireAdmin(req);
    const body = await readJson<{ decision?: string; reason?: string; expectedVersion?: number }>(req);
    const e = await decideEvent(admin.id, params.id, body.decision || "", body.reason || "", Number(body.expectedVersion || 0));
    return jsonData({ event: eventDto(e) }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
