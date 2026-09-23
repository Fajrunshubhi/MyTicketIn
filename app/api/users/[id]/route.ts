import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/guard";
import { getUserById } from "@/lib/server/session";
import { AppError } from "@/lib/server/http";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await requireAuth(req);
    if (actor.id !== params.id && actor.role !== "ADMIN") throw new AppError("FORBIDDEN", "Anda tidak memiliki akses.", {}, 403);
    const user = await getUserById(params.id);
    if (!user) throw new AppError("NOT_FOUND", "Pengguna tidak ditemukan.", {}, 404);
    return jsonData({ id: user.id, name: user.name, username: user.username, email: user.email, role: user.role }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
