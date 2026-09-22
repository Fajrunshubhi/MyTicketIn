import { cache } from "react";
import { cookies } from "next/headers";
import { getPublicApiBaseUrl } from "@/lib/env";

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
    const res = await fetch(`${getPublicApiBaseUrl()}/api/auth/session`, {
      headers: { Cookie: `mti_session=${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { user?: PublicSessionUser };
    return body.user?.id ? body.user : null;
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
