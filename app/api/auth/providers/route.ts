import { NextRequest } from "next/server";
import { jsonOk, routeHandler } from "@/lib/server/http";

export const GET = routeHandler(async (req: NextRequest) => {
  const enabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return jsonOk({ google: enabled }, 200, undefined, req);
});
