import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireMutating, requireOrganizerProfile } from "@/lib/server/guard";
import { createImageIntent } from "@/lib/server/event-extras";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireMutating(req);
    const { organizerProfileId } = await requireOrganizerProfile(req);
    const body = await readJson<Record<string, unknown>>(req);
    const upload = await createImageIntent(organizerProfileId, params.id, body);
    return jsonData({ upload }, 201, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
