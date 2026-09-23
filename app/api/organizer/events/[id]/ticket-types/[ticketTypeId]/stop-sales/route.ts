import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireMutating, requireOrganizerProfile } from "@/lib/server/guard";
import { lifeDto, requestStopSales } from "@/lib/server/lifecycle";

export async function POST(req: NextRequest, { params }: { params: { id: string; ticketTypeId: string } }) {
  try {
    requireMutating(req);
    const { user, organizerProfileId } = await requireOrganizerProfile(req);
    const body = await readJson<{ reason?: string }>(req);
    const row = await requestStopSales(organizerProfileId, params.id, params.ticketTypeId, user.id, String(body.reason || ""));
    return jsonData({ request: lifeDto(row) }, 201, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
