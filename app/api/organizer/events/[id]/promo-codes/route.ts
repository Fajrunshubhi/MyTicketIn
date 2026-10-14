import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireMutating, requireOrganizerProfile } from "@/lib/server/guard";
import { createPromo, listPromos, type PromoInput } from "@/lib/server/promo";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { organizerProfileId } = await requireOrganizerProfile(req);
    return jsonData({ items: await listPromos(organizerProfileId, params.id) }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireMutating(req);
    const { organizerProfileId } = await requireOrganizerProfile(req);
    const body = await readJson<PromoInput>(req);
    return jsonData({ promo: await createPromo(organizerProfileId, params.id, body) }, 201, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
