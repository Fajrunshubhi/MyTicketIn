import { NextRequest, NextResponse } from "next/server";
import { jsonError, routeHandler } from "@/lib/server/http";
import { requireOrganizerProfile } from "@/lib/server/guard";
import { readRefundProof } from "@/lib/server/refunds";

export const GET = routeHandler(async (req: NextRequest, ctx) => {
  const { user } = await requireOrganizerProfile(req);
  const id = String(ctx.params?.id || "");
  try {
    const file = await readRefundProof(user.id, user.role, id);
    return new NextResponse(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        "Content-Type": file.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return jsonError(err, req);
  }
});
