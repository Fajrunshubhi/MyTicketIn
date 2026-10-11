import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/guard";
import { listAdminPayouts } from "@/lib/server/payouts";

export const GET = routeHandler(async (req: NextRequest) => {
  await requireAdmin(req);
  const status = (new URL(req.url).searchParams.get("status") || "").toUpperCase();
  return jsonData({ items: await listAdminPayouts(status), sandbox: true }, 200, req);
});
