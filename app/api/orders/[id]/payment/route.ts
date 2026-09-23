import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireAuth, requireMutating } from "@/lib/server/guard";
import { createPayment, getPayment } from "@/lib/server/payments";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth(req);
    const payment = await getPayment(user, params.id);
    return jsonData({ payment }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireMutating(req);
    const user = await requireAuth(req);
    let method = "VIRTUAL_ACCOUNT";
    try {
      const body = await readJson<{ method?: string }>(req);
      method = body.method || method;
    } catch {
      method = "VIRTUAL_ACCOUNT";
    }
    const { payment, replay } = await createPayment(user, params.id, method);
    return jsonData({ payment, loyalty: null }, replay ? 200 : 201, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
