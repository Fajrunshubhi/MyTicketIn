import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireScheduler } from "@/lib/server/guard";
import { purgeRejectedDocuments } from "@/lib/server/organizer-documents";

export const POST = routeHandler(async (req: NextRequest) => {
  requireScheduler(req);
  return jsonData(await purgeRejectedDocuments(), 200, req);
});
