import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireAdmin, requireMutating } from "@/lib/server/guard";
import { resolveReconciliation } from "@/lib/server/admin-finance";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireMutating(req);
    const admin = await requireAdmin(req);
    const body = await readJson<{ decision?: string; notes?: string }>(req);
    const reconciliation = await resolveReconciliation(admin.id, params.id, String(body.decision || ""), String(body.notes || ""));
    return jsonData({ reconciliation, sandbox: true }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
