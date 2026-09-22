import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { BuyerShell } from "@/components/dashboard/BuyerShell";
import { loadSessionUser } from "@/lib/session";

export default async function OrganizerStatusLayout({ children }: { children: ReactNode }) {
  const user = await loadSessionUser();
  if (!user) {
    redirect("/login?callbackUrl=/organizer/status&portal=buyer");
  }
  if (user.access?.canOrganize || user.access?.isAdmin) {
    redirect("/dashboard");
  }
  return <BuyerShell>{children}</BuyerShell>;
}
