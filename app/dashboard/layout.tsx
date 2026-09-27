import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { DashboardFrame } from "@/components/dashboard/DashboardFrame";
import { loadSessionUser } from "@/lib/session";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await loadSessionUser();
  if (!user) {
    redirect("/login?callbackUrl=/dashboard");
  }
  if (user.access?.kind === "staff") {
    redirect("/petugas");
  }
  if (user.access?.kind === "organizer") {
    return <DashboardFrame role="organizer" canWrite={Boolean(user.access.canOrganize)}>
      {children}
    </DashboardFrame>;
  }
  if (user.access?.isAdmin || user.role === "ADMIN") {
    return <DashboardFrame role="admin">{children}</DashboardFrame>;
  }
  return <DashboardFrame role="buyer">{children}</DashboardFrame>;
}
