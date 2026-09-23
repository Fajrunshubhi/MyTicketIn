import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/guard";
import { getAuditLog } from "@/lib/server/audit";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin(req);
    return jsonData(await getAuditLog(params.id), 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
