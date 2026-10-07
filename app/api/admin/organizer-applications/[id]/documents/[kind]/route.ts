import { NextRequest, NextResponse } from "next/server";
import { correlationId, routeHandler } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/guard";
import { parseDocumentKind, readDocumentAsAdmin } from "@/lib/server/organizer-documents";

export const GET = routeHandler(async (req: NextRequest, ctx) => {
  const admin = await requireAdmin(req);
  const kind = parseDocumentKind(String(ctx.params?.kind || ""));
  const file = await readDocumentAsAdmin(admin.id, String(ctx.params?.id || ""), kind, correlationId(req));
  return new NextResponse(new Uint8Array(file.bytes), {
    status: 200,
    headers: { "Content-Type": file.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
});
