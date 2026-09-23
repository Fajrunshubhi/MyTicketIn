import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/guard";
import { getTicket } from "@/lib/server/tickets";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth(req);
    const ticket = await getTicket(user, params.id);
    return jsonData({ ticket }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
