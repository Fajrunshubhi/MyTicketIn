import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireAdmin, requireMutating } from "@/lib/server/guard";
import { requestRefund } from "@/lib/server/admin-finance";

export async function POST(req: NextRequest) {
  try {
    requireMutating(req);
    const admin = await requireAdmin(req);
    const body = await readJson<{ orderId?: string; amountRupiah?: number; reason?: string }>(req);
    const refund = await requestRefund(admin.id, String(body.orderId || ""), Number(body.amountRupiah || 0), String(body.reason || ""));
    return jsonData({ refund }, 201, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
