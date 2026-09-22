import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/dashboard/AdminShell";
import { loadSessionUser } from "@/lib/session";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await loadSessionUser();
  if (!user) {
    redirect("/login?callbackUrl=/admin/operations&portal=admin");
  }
  if (!user.access?.isAdmin && user.role !== "ADMIN") {
    redirect("/dashboard");
  }
  return <AdminShell>{children}</AdminShell>;
}
