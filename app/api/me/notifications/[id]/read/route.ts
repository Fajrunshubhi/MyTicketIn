import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http";
import { requireAuth, requireMutating } from "@/lib/server/guard";
import { markRead } from "@/lib/server/notifications";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireMutating(req);
    const user = await requireAuth(req);
    await markRead(user, params.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return jsonError(err, req);
  }
}
