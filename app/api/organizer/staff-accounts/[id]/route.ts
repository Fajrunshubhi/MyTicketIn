import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireMutating, requireOrganizerProfile } from "@/lib/server/guard";
import { disableStaffAccount, updateStaffAccount } from "@/lib/server/staff-accounts";

export const PATCH = routeHandler(async (req: NextRequest, ctx) => {
  requireMutating(req);
  const { user } = await requireOrganizerProfile(req);
  const id = String(ctx.params?.id || "");
  const body = (await req.json().catch(() => null)) as {
    username?: string;
    displayName?: string;
    password?: string;
    expectedVersion?: number;
  } | null;
  const item = await updateStaffAccount(user.id, id, body || {});
  return jsonData({ item }, 200, req);
});

export const DELETE = routeHandler(async (req: NextRequest, ctx) => {
  requireMutating(req);
  const { user } = await requireOrganizerProfile(req);
  const id = String(ctx.params?.id || "");
  const body = (await req.json().catch(() => ({}))) as { expectedVersion?: number };
  await disableStaffAccount(user.id, id, Number(body.expectedVersion));
  return jsonData({ ok: true }, 200, req);
});
