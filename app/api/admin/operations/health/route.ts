import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/guard";
import { pingDatabase } from "@/lib/server/http";
import { adminOperationsHealth } from "@/lib/server/reporting";

export const GET = routeHandler(async (req: NextRequest) => {
  await requireAdmin(req);
  const ok = await pingDatabase();
  const health = await adminOperationsHealth();
  return jsonData({ ...health, database: ok ? "ok" : "error" }, 200, req);
});
