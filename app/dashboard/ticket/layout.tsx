import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { loadSessionUser } from "@/lib/session";

export default async function BuyerTicketLayout({ children }: { children: ReactNode }) {
  const user = await loadSessionUser();
  if (!user) {
    redirect("/login?callbackUrl=/dashboard/ticket&portal=buyer");
  }
  if (user.access?.kind === "organizer" || user.access?.isAdmin) {
    redirect("/dashboard");
  }
  return children;
}
