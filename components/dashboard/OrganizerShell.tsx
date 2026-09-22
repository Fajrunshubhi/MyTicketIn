"use client";

import { type ReactNode } from "react";
import { WorkspaceShell, type WorkspaceNavItem } from "@/components/dashboard/WorkspaceShell";
import { type IconName } from "@/components/ui/Icon";

const NAV: WorkspaceNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" as IconName, exact: true },
  { href: "/dashboard/event", label: "Event", icon: "catalog" },
  { href: "/dashboard/event/new", label: "Buat event", icon: "userPlus", exact: true },
  { href: "/dashboard/laporan", label: "Laporan", icon: "chart" },
  { href: "/dashboard/notifications", label: "Notifikasi", icon: "bell" },
  { href: "/dashboard/profile", label: "Profil", icon: "user" },
];

function pageTitle(pathname: string): string {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname === "/dashboard/laporan") return "Laporan";
  if (pathname === "/dashboard/event") return "Event";
  if (pathname === "/dashboard/event/new") return "Buat event";
  if (pathname.endsWith("/preview")) return "Pratinjau privat";
  if (pathname.endsWith("/staff")) return "Kelola petugas";
  if (pathname.endsWith("/scanner")) return "Scanner check-in";
  if (pathname.endsWith("/check-in-attempts")) return "Riwayat check-in";
  if (pathname.startsWith("/dashboard/event/")) return "Detail event";
  if (pathname.startsWith("/dashboard/notifications")) return "Notifikasi";
  if (pathname.startsWith("/dashboard/profile")) return "Profil";
  return "Dashboard";
}

export function OrganizerShell({ children }: { children: ReactNode }) {
  return (
    <WorkspaceShell
      nav={NAV}
      navAriaLabel="Menu penyelenggara"
      storageKey="mti-organizer-nav"
      titleForPath={pageTitle}
      searchPlaceholder="Cari event, kota, atau venue"
      searchPath={(q) => (q ? `/dashboard/event?q=${encodeURIComponent(q)}` : "/dashboard/event")}
      notificationsHref="/dashboard/notifications"
      primaryHref="/dashboard/event/new"
      primaryLabel="+ Buat event"
    >
      {children}
    </WorkspaceShell>
  );
}
