import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireMutating } from "@/lib/server/guard";

export const POST = routeHandler(async (req: NextRequest) => {
  requireMutating(req);
  return jsonData({ accepted: true }, 202, req);
});
