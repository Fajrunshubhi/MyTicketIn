import { NextRequest } from "next/server";
import { accessFor, userPayload } from "@/lib/server/access";
import { requireCsrf } from "@/lib/server/cookies";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireUser, updateProfile } from "@/lib/server/session";

export const GET = routeHandler(async (req: NextRequest) => {
  const user = await requireUser(req);
  const acc = await accessFor(user);
  return jsonData(userPayload(user, acc.kind, acc, ""), 200, req);
});

export const PATCH = routeHandler(async (req: NextRequest) => {
  requireCsrf(req);
  const user = await requireUser(req);
  const body = (await req.json().catch(() => null)) as { name?: string; email?: string } | null;
  if (!body) {
    const { AppError } = await import("@/lib/server/http");
    throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", {}, 400);
  }
  const updated = await updateProfile(user, body.name || "", body.email || "");
  const acc = await accessFor(updated);
  return jsonData(userPayload(updated, acc.kind, acc, ""), 200, req);
});
