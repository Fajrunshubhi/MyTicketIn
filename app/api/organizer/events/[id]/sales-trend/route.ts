import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { requireOrganizerProfile } from "@/lib/server/guard";
import { getOwnedEvent } from "@/lib/server/events-organizer";
import { salesTrend } from "@/lib/server/reporting";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { organizerProfileId } = await requireOrganizerProfile(req);
    await getOwnedEvent(organizerProfileId, params.id);
    const q = req.nextUrl.searchParams;
    return jsonData(
      await salesTrend(organizerProfileId, params.id, q.get("from") || "", q.get("to") || "", q.get("bucket") || "day"),
      200,
      req,
    );
  } catch (err) {
    return jsonError(err, req);
  }
}
