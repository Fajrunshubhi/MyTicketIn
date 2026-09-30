"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { WorkspaceShell, type WorkspaceNavItem } from "@/components/dashboard/WorkspaceShell";
import { type IconName } from "@/components/ui/Icon";

const NAV: WorkspaceNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" as IconName, exact: true },
  { href: "/admin/operations", label: "Operasi", icon: "clock" },
  { href: "/admin/organizers", label: "Organizer", icon: "building" },
  { href: "/admin/events", label: "Event", icon: "catalog" },
  { href: "/admin/audit", label: "Audit", icon: "file" },
  { href: "/admin/payment-reconciliations", label: "Pembayaran", icon: "orders" },
  { href: "/admin/refunds", label: "Pengawasan refund", icon: "ticket" },
  { href: "/dashboard/notifications", label: "Notifikasi", icon: "bell" },
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
  if (pathname.startsWith("/admin/refunds")) return "Pengawasan refund";
  if (pathname.startsWith("/dashboard/notifications")) return "Notifikasi";
  if (pathname.startsWith("/admin/password-reset")) return "Bantuan reset kata sandi";
  if (pathname.startsWith("/dashboard/profile")) return "Profil";
  return "Admin";
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const organizerQueue = pathname.startsWith("/admin/organizers");
  return (
    <WorkspaceShell
      nav={NAV}
      navAriaLabel="Menu admin"
      storageKey="mti-admin-nav"
      titleForPath={pageTitle}
      searchPlaceholder={organizerQueue ? "Cari nama organizer" : "Cari event untuk dimoderasi"}
      searchPath={(q) =>
        organizerQueue
          ? q
            ? `/admin/organizers?q=${encodeURIComponent(q)}`
            : "/admin/organizers"
          : q
            ? `/admin/events?q=${encodeURIComponent(q)}`
            : "/admin/events"
      }
      notificationsHref="/dashboard/notifications"
      primaryHref="/admin/operations"
      primaryLabel="Antrean"
    >
      {children}
    </WorkspaceShell>
  );
}
