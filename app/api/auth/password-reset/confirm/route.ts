import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { readJson, requireMutating } from "@/lib/server/guard";
import { confirmPasswordReset } from "@/lib/server/session";

export const POST = routeHandler(async (req: NextRequest) => {
  requireMutating(req);
  const body = await readJson<{ token?: string; newPassword?: string; confirmPassword?: string }>(req);
  await confirmPasswordReset(body.token || "", body.newPassword || "", body.confirmPassword || "");
  return jsonData({ message: "Kata sandi berhasil diubah. Silakan masuk kembali." }, 200, req);
});
