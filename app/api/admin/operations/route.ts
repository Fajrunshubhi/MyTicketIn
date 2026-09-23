import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/guard";
import { adminOperationsQueue } from "@/lib/server/reporting";

export const GET = routeHandler(async (req: NextRequest) => {
  await requireAdmin(req);
  const queue = req.nextUrl.searchParams.get("queue") || "moderation";
  return jsonData(await adminOperationsQueue(queue), 200, req);
});
