import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/dashboard/AdminShell";
import { BuyerShell } from "@/components/dashboard/BuyerShell";
import { loadSessionUser } from "@/lib/session";

export default async function NotificationsLayout({ children }: { children: ReactNode }) {
  const user = await loadSessionUser();
  if (!user) {
    redirect("/login?callbackUrl=/notifications");
  }
  if (user.access?.canOrganize) {
    redirect("/dashboard/notifications");
  }
  if (user.access?.isAdmin || user.role === "ADMIN") {
    return <AdminShell>{children}</AdminShell>;
  }
  return <BuyerShell>{children}</BuyerShell>;
}
