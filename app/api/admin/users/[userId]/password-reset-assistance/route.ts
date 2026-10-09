import { NextRequest } from "next/server";
import { jsonOk, routeHandler } from "@/lib/server/http";
import { readJson, requireAdmin, requireMutating } from "@/lib/server/guard";
import { assistPasswordReset } from "@/lib/server/session";

export const POST = routeHandler(async (req: NextRequest, ctx) => {
  requireMutating(req);
  const admin = await requireAdmin(req);
  const body = await readJson<{ reason?: string }>(req);
  const result = await assistPasswordReset(admin, ctx.params?.userId || "", body.reason || "");
  return jsonOk(
    {
      data: {
        message:
          result.delivery === "sent"
            ? `Tautan pemulihan dikirim ke ${result.maskedEmail}.`
            : "Email belum dikonfigurasi (mode sandbox). Serahkan token sekali pakai melalui kanal demo terkontrol.",
        expiresInMinutes: 30,
        delivery: result.delivery,
        maskedEmail: result.maskedEmail,
        ...(result.token ? { oneTimeToken: result.token } : {}),
        sandbox: result.delivery !== "sent",
      },
    },
    202,
    undefined,
    req,
  );
});
