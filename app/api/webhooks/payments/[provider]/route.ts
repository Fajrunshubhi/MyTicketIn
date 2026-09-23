import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";

export const POST = routeHandler(async (req: NextRequest) => {
  void req;
  return jsonData({ received: true }, 200, req);
});
