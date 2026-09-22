import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { BuyerShell } from "@/components/dashboard/BuyerShell";
import { loadSessionUser } from "@/lib/session";

export default async function OrdersLayout({ children }: { children: ReactNode }) {
  const user = await loadSessionUser();
  if (!user) {
    redirect("/login?callbackUrl=/orders&portal=buyer");
  }
  if (user.access?.canOrganize || user.access?.isAdmin) {
    redirect("/dashboard");
  }
  return <BuyerShell>{children}</BuyerShell>;
}
