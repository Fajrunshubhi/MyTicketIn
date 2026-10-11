import { NextRequest, NextResponse } from "next/server";
import { routeHandler } from "@/lib/server/http";
import { requireOrganizerProfile } from "@/lib/server/guard";
import { readPayoutProof } from "@/lib/server/payouts";

export const GET = routeHandler(async (req: NextRequest, ctx) => {
  const { user } = await requireOrganizerProfile(req);
  const file = await readPayoutProof(user.id, user.role, String(ctx.params?.id || ""));
  return new NextResponse(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
