import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireMutating, requireOrganizerProfile } from "@/lib/server/guard";
import { assignStaff, listStaff } from "@/lib/server/staff";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { organizerProfileId } = await requireOrganizerProfile(req);
    const items = await listStaff(organizerProfileId, params.id);
    return jsonData({ items }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireMutating(req);
    const { user, organizerProfileId } = await requireOrganizerProfile(req);
    const body = await readJson<{ userId?: string }>(req);
    const assignment = await assignStaff(organizerProfileId, params.id, user.id, String(body.userId || ""));
    return jsonData({ assignment }, 201, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
