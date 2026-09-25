import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/guard";
import { renderTicketQrPng } from "@/lib/server/qr-png";
import { ticketQrPayload } from "@/lib/server/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth(req);
    const token = await ticketQrPayload(user, params.id);
    const png = await renderTicketQrPng(token);
    return new NextResponse(Buffer.from(png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="ticket-${params.id}.png"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return jsonError(err, req);
  }
}
