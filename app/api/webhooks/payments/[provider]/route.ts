import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { handlePaymentWebhook } from "@/lib/server/payment-webhook";
import { clientIp } from "@/lib/server/rate-limit";

// Raw text is required: the signature covers the exact bytes the provider sent.
export const POST = routeHandler(async (req: NextRequest, ctx) => {
  const rawBody = await req.text();
  const result = await handlePaymentWebhook({
    provider: String(ctx.params?.provider || ""),
    rawBody,
    signature: req.headers.get("x-sandbox-signature") || "",
    ip: clientIp(req),
  });
  return jsonData(result.body, result.status, req);
});
