import { cache } from "react";
import { cookies } from "next/headers";
import { accessFor, userPayload } from "@/lib/server/access";
import { sessionFromToken } from "@/lib/server/session";

export type PublicSessionUser = {
  id: string;
  role?: string;
  nextPath?: string;
  access?: {
    isAdmin?: boolean;
    canOrganize?: boolean;
    canBuy?: boolean;
  };
};

export const loadSessionUser = cache(async (): Promise<PublicSessionUser | null> => {
  const token = cookies().get("mti_session")?.value;
  if (!token) {
    return null;
  }
  try {
    const sess = await sessionFromToken(token);
    if (!sess) return null;
    const acc = await accessFor(sess.user);
    return userPayload(sess.user, acc.kind, acc, "");
  } catch {
    return null;
  }
});

export function sessionHomePath(user: PublicSessionUser): string {
  if (user.access?.isAdmin) {
    return "/dashboard";
  }
  return "/";
}
