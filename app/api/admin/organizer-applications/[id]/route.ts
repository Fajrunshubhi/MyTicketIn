import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/guard";
import { getById, ownerDto } from "@/lib/server/organizers";
import { AppError } from "@/lib/server/http";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin(req);
    const p = await getById(params.id);
    if (!p) throw new AppError("ORGANIZER_APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.", {}, 404);
    return jsonData({ ...ownerDto(p), ownerUserId: `${p.owner_user_id.slice(0, 4)}••••` }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
