import { NextRequest } from "next/server";
import { AppError, jsonData, routeHandler } from "@/lib/server/http";
import { requireMutating, requireOrganizerProfile } from "@/lib/server/guard";
import { confirmOrganizerTransfer } from "@/lib/server/refunds";

export const POST = routeHandler(async (req: NextRequest, ctx) => {
  requireMutating(req);
  const { user, organizerProfileId } = await requireOrganizerProfile(req);
  const id = String(ctx.params?.id || "");
  const form = await req.formData().catch(() => null);
  const file = form?.get("proof");
  const bytes = file instanceof File && file.size > 0 ? Buffer.from(await file.arrayBuffer()) : null;
  if (!bytes && req.headers.get("content-type")?.includes("multipart") && !(file instanceof File)) {
    throw new AppError("VALIDATION_ERROR", "Unggah foto bukti transfer.", { proof: "Bukti transfer wajib." }, 400);
  }
  const refund = await confirmOrganizerTransfer(user.id, organizerProfileId, id, bytes);
  return jsonData({ refund }, 200, req);
});
