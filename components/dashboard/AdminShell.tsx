"use client";

import { type ReactNode } from "react";
import { WorkspaceShell, type WorkspaceNavItem } from "@/components/dashboard/WorkspaceShell";
import { type IconName } from "@/components/ui/Icon";

const NAV: WorkspaceNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" as IconName, exact: true },
  { href: "/admin/operations", label: "Operasi", icon: "clock" },
  { href: "/admin/organizers", label: "Organizer", icon: "building" },
  { href: "/admin/events", label: "Event", icon: "catalog" },
  { href: "/admin/audit", label: "Audit", icon: "file" },
  { href: "/admin/payment-reconciliations", label: "Pembayaran", icon: "orders" },
  { href: "/admin/refunds", label: "Refund", icon: "ticket" },
  { href: "/admin/password-reset", label: "Reset sandi", icon: "shield" },
  { href: "/dashboard/profile", label: "Profil", icon: "user" },
];

function pageTitle(pathname: string): string {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname.startsWith("/admin/operations")) return "Antrean operasional";
  if (pathname.startsWith("/admin/organizers")) return "Moderasi organizer";
  if (pathname.startsWith("/admin/events")) return "Moderasi event";
  if (pathname.startsWith("/admin/audit")) return "Jejak audit";
  if (pathname.startsWith("/admin/payment-reconciliations")) return "Rekonsiliasi";
  if (pathname.startsWith("/admin/refunds")) return "Refund sandbox";
  if (pathname.startsWith("/admin/password-reset")) return "Bantuan reset kata sandi";
  if (pathname.startsWith("/dashboard/profile")) return "Profil";
  return "Admin";
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <WorkspaceShell
      nav={NAV}
      navAriaLabel="Menu admin"
      storageKey="mti-admin-nav"
      titleForPath={pageTitle}
      searchPlaceholder="Cari event untuk dimoderasi"
      searchPath={(q) => (q ? `/admin/events?q=${encodeURIComponent(q)}` : "/admin/events")}
      notificationsHref="/notifications"
      primaryHref="/admin/operations"
      primaryLabel="Antrean"
    >
      {children}
    </WorkspaceShell>
  );
}
