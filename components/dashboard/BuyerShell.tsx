"use client";

import { type ReactNode } from "react";
import { WorkspaceShell, type WorkspaceNavItem } from "@/components/dashboard/WorkspaceShell";
import { type IconName } from "@/components/ui/Icon";

const NAV: WorkspaceNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" as IconName, exact: true },
  { href: "/events", label: "Katalog", icon: "catalog" },
  { href: "/orders", label: "Order", icon: "orders" },
  { href: "/tickets", label: "Tiket", icon: "ticket" },
  { href: "/notifications", label: "Notifikasi", icon: "bell" },
  { href: "/dashboard/profile", label: "Profil", icon: "user" },
];

function pageTitle(pathname: string): string {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname.startsWith("/orders")) return "Order saya";
  if (pathname.startsWith("/tickets")) return "Tiket saya";
  if (pathname.startsWith("/notifications")) return "Notifikasi";
  if (pathname.startsWith("/dashboard/profile")) return "Profil";
  if (pathname.startsWith("/organizer/apply")) return "Pengajuan organizer";
  if (pathname.startsWith("/organizer/status")) return "Status pengajuan";
  if (pathname.startsWith("/events")) return "Katalog";
  return "Dashboard";
}

export function BuyerShell({ children }: { children: ReactNode }) {
  return (
    <WorkspaceShell
      nav={NAV}
      navAriaLabel="Menu pembeli"
      storageKey="mti-buyer-nav"
      titleForPath={pageTitle}
      searchPlaceholder="Cari event di katalog"
      searchPath={(q) => (q ? `/events?q=${encodeURIComponent(q)}` : "/events")}
      notificationsHref="/notifications"
      primaryHref="/events"
      primaryLabel="Lihat katalog"
    >
      {children}
    </WorkspaceShell>
  );
}
