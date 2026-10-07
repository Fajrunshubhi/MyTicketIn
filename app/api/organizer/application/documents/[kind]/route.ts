import { NextRequest, NextResponse } from "next/server";
import { AppError, routeHandler } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/guard";
import { getByOwner } from "@/lib/server/organizers";
import { parseDocumentKind, readDocument } from "@/lib/server/organizer-documents";

// Only the applicant can read their own documents back; the response is never cacheable.
export const GET = routeHandler(async (req: NextRequest, ctx) => {
  const user = await requireAuth(req);
  const kind = parseDocumentKind(String(ctx.params?.kind || ""));
  const p = await getByOwner(user.id);
  if (!p) throw new AppError("NOT_FOUND", "Dokumen tidak ditemukan.", {}, 404);
  const file = await readDocument(p.id, kind);
  return new NextResponse(new Uint8Array(file.bytes), {
    status: 200,
    headers: { "Content-Type": file.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
});
