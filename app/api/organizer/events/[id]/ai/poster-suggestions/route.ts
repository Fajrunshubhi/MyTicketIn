import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { requireMutating, requireOrganizerProfile } from "@/lib/server/guard";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireMutating(req);
    const { organizerProfileId } = await requireOrganizerProfile(req);
    void organizerProfileId;
    void params.id;
    return jsonData({ suggestions: [] as { field: string; value: string; confidence: string }[], fallback: true }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
