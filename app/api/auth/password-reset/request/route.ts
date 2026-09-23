import { NextRequest } from "next/server";
import { jsonOk, routeHandler } from "@/lib/server/http";
import { requireMutating, readJson } from "@/lib/server/guard";
import { requestPasswordReset } from "@/lib/server/session";

export const POST = routeHandler(async (req: NextRequest) => {
  requireMutating(req);
  const body = await readJson<{ email?: string }>(req);
  await requestPasswordReset(body.email || "");
  return jsonOk(
    { data: { message: "Jika akun memenuhi syarat, instruksi pemulihan akan dikirim." } },
    202,
    undefined,
    req,
  );
});
