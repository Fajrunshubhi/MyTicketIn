import { NextRequest, NextResponse } from "next/server";
import { correlationId, routeHandler } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/guard";
import { parseDocumentKind } from "@/lib/server/organizer-documents";
import { readChangeDocumentAsAdmin } from "@/lib/server/organizer-changes";

export const GET = routeHandler(async (req: NextRequest, ctx) => {
  const admin = await requireAdmin(req);
  const kind = parseDocumentKind(String(ctx.params?.kind || ""));
  const file = await readChangeDocumentAsAdmin(admin.id, String(ctx.params?.id || ""), kind, correlationId(req));
  return new NextResponse(new Uint8Array(file.bytes), {
    status: 200,
    headers: { "Content-Type": file.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
});
