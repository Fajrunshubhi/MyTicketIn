import { NextRequest, NextResponse } from "next/server";
import { jsonError, routeHandler } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/guard";
import { readRefundProof } from "@/lib/server/refunds";

export const GET = routeHandler(async (req: NextRequest, ctx) => {
  const admin = await requireAdmin(req);
  const id = String(ctx.params?.id || "");
  try {
    const file = await readRefundProof(admin.id, admin.role, id);
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
