import { NextRequest } from "next/server";
import { accessFor, parseRegisterIntent, userPayload } from "@/lib/server/access";
import { requireCsrf } from "@/lib/server/cookies";
import { jsonData, routeHandler } from "@/lib/server/http";
import { registerUser } from "@/lib/server/session";

export const POST = routeHandler(async (req: NextRequest) => {
  requireCsrf(req);
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    username?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    intent?: string;
  } | null;
  if (!body) {
    const { AppError } = await import("@/lib/server/http");
    throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", {}, 400);
  }
  const intent = parseRegisterIntent(body.intent || "");
  const user = await registerUser({
    name: body.name || "",
    username: body.username || "",
    email: body.email || "",
    password: body.password || "",
    confirmPassword: body.confirmPassword || "",
  });
  const acc = await accessFor(user);
  return jsonData(userPayload(user, intent, acc, ""), 201, req);
});
