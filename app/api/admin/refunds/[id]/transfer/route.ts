import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireAdmin, requireMutating } from "@/lib/server/guard";
import { confirmAdminTransfer } from "@/lib/server/admin-finance";

export const POST = routeHandler(async (req: NextRequest, ctx) => {
  requireMutating(req);
  const admin = await requireAdmin(req);
  const id = String(ctx.params?.id || "");
  const form = await req.formData().catch(() => null);
  const file = form?.get("proof");
  const bytes = file instanceof File && file.size > 0 ? Buffer.from(await file.arrayBuffer()) : null;
  const refund = await confirmAdminTransfer(admin.id, id, bytes);
  return jsonData({ refund }, 200, req);
});
