import { NextRequest } from "next/server";
import { accessFor, userPayload } from "@/lib/server/access";
import { requireCsrf } from "@/lib/server/cookies";
import { AppError, jsonData, routeHandler } from "@/lib/server/http";
import { getBuyerProfile, requireUser, updateProfile } from "@/lib/server/session";

export const GET = routeHandler(async (req: NextRequest) => {
  const user = await requireUser(req);
  const acc = await accessFor(user);
  const profile = await getBuyerProfile(user.id);
  return jsonData(userPayload(user, acc.kind, acc, "", profile || undefined), 200, req);
});

export const PATCH = routeHandler(async (req: NextRequest) => {
  requireCsrf(req);
  const user = await requireUser(req);
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    username?: string;
    email?: string;
    phone?: string;
    dateOfBirth?: string;
    city?: string;
    gender?: string;
  } | null;
  if (!body) {
    throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", {}, 400);
  }
  const updated = await updateProfile(user, {
    name: body.name || "",
    username: body.username,
    email: body.email || "",
    phone: body.phone,
    dateOfBirth: body.dateOfBirth,
    city: body.city,
    gender: body.gender,
  });
  const acc = await accessFor(updated);
  return jsonData(userPayload(updated, acc.kind, acc, "", updated), 200, req);
});
