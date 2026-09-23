import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/guard";
import { loyaltyAccount } from "@/lib/server/orders";

export async function GET(req: NextRequest, { params }: { params: { organizerProfileId: string } }) {
  try {
    const user = await requireAuth(req);
    const out = await loyaltyAccount(user, params.organizerProfileId);
    return jsonData(out, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
