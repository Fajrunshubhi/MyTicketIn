import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireAuth, requireMutating } from "@/lib/server/guard";
import { getOrder } from "@/lib/server/orders";
import { listOrderRefunds, requestBuyerRefund } from "@/lib/server/refunds";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth(req);
    await getOrder(user, params.id);
    const items = await listOrderRefunds(params.id);
    return jsonData({ items, sandbox: true, cashValue: false }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireMutating(req);
    const user = await requireAuth(req);
    await getOrder(user, params.id);
    const body = await readJson<{
      reason?: string;
      bankName?: string;
      accountName?: string;
      accountNumber?: string;
    }>(req);
    const refund = await requestBuyerRefund(user.id, params.id, String(body.reason || ""), {
      bankName: body.bankName,
      accountName: body.accountName,
      accountNumber: body.accountNumber,
    });
    return jsonData({ refund }, 201, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
