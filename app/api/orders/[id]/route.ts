import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/guard";
import { getOrder } from "@/lib/server/orders";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth(req);
    const order = await getOrder(user, params.id);
    return jsonData({ order }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
