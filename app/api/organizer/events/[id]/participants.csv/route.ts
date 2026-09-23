import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http";
import { requireOrganizerProfile } from "@/lib/server/guard";
import { getOwnedEvent } from "@/lib/server/events-organizer";
import { listParticipants } from "@/lib/server/reporting";

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { organizerProfileId } = await requireOrganizerProfile(req);
    await getOwnedEvent(organizerProfileId, params.id);
    const rows = await listParticipants(organizerProfileId, params.id);
    const header = "nomor_order,nomor_tiket,nama_pemegang,email,telepon,nik,jenis_tiket,kategori_area,label_kursi,status_tiket,waktu_terbit,waktu_check_in";
    const lines = rows.map((r) =>
      [
        r.orderNumber,
        r.ticketNumber,
        r.holderName,
        r.holderEmail,
        r.holderPhone,
        r.holderIdentityNumber,
        r.ticketTypeName,
        r.sectionName,
        r.seatLabel,
        r.status,
        r.issuedAt,
        r.usedAt,
      ]
        .map(csvEscape)
        .join(","),
    );
    const body = [header, ...lines].join("\n");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="participants-${params.id}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return jsonError(err, req);
  }
}
