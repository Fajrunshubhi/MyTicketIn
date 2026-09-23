import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { requireAuth, requireMutating } from "@/lib/server/guard";
import { sandboxSettle } from "@/lib/server/payments";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireMutating(req);
    const user = await requireAuth(req);
    const out = await sandboxSettle(user, params.id);
    return jsonData(out, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
