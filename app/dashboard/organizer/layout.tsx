import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { loadSessionUser } from "@/lib/session";

export default async function DashboardOrganizerLayout({ children }: { children: ReactNode }) {
  const user = await loadSessionUser();
  if (!user) {
    redirect("/login?callbackUrl=/dashboard/organizer/apply&portal=buyer");
  }
  if (user.access?.isAdmin) {
    redirect("/dashboard");
  }
  return children;
}
