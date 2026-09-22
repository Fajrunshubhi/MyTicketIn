import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/dashboard/AdminShell";
import { BuyerShell } from "@/components/dashboard/BuyerShell";
import { OrganizerShell } from "@/components/dashboard/OrganizerShell";
import { loadSessionUser } from "@/lib/session";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await loadSessionUser();
  if (!user) {
    redirect("/login?callbackUrl=/dashboard");
  }
  if (user.access?.canOrganize) {
    return <OrganizerShell>{children}</OrganizerShell>;
  }
  if (user.access?.isAdmin || user.role === "ADMIN") {
    return <AdminShell>{children}</AdminShell>;
  }
  return <BuyerShell>{children}</BuyerShell>;
}
