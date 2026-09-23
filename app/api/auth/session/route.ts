import { NextRequest } from "next/server";
import { accessFor, userPayload } from "@/lib/server/access";
import { jsonOk, routeHandler } from "@/lib/server/http";
import { sessionFromRequest } from "@/lib/server/session";

export const GET = routeHandler(async (req: NextRequest) => {
  const sess = await sessionFromRequest(req);
  if (!sess) {
    return jsonOk({}, 200, undefined, req);
  }
  const acc = await accessFor(sess.user);
  return jsonOk(
    { user: userPayload(sess.user, acc.kind, acc, ""), expires: sess.expiresAt.toISOString() },
    200,
    undefined,
    req,
  );
});
