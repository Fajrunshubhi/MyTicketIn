import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireScheduler } from "@/lib/server/guard";
import { purgeRejectedDocuments } from "@/lib/server/organizer-documents";
import { purgeChangeDocuments } from "@/lib/server/organizer-changes";

export const POST = routeHandler(async (req: NextRequest) => {
  requireScheduler(req);
  const applications = await purgeRejectedDocuments();
  const changes = await purgeChangeDocuments();
  return jsonData({ ...applications, changeDocuments: changes.documents }, 200, req);
});
