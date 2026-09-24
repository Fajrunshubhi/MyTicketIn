import { NextRequest } from "next/server";
import { jsonData, routeHandler } from "@/lib/server/http";
import { requireMutating, requireOrganizerProfile } from "@/lib/server/guard";
import { createStaffAccount, listStaffAccounts } from "@/lib/server/staff-accounts";

export const GET = routeHandler(async (req: NextRequest) => {
  const { user } = await requireOrganizerProfile(req);
  const items = await listStaffAccounts(user.id);
  return jsonData({ items }, 200, req);
});

export const POST = routeHandler(async (req: NextRequest) => {
  requireMutating(req);
  const { user } = await requireOrganizerProfile(req);
  const body = (await req.json().catch(() => null)) as {
    username?: string;
    displayName?: string;
    password?: string;
  } | null;
  const item = await createStaffAccount(user.id, body || {});
  return jsonData({ item }, 201, req);
});
