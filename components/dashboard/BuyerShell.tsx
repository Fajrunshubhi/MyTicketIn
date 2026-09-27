"use client";

import { type ReactNode } from "react";
import { WorkspaceShell, type WorkspaceNavItem } from "@/components/dashboard/WorkspaceShell";
import { type IconName } from "@/components/ui/Icon";

const NAV: WorkspaceNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" as IconName, exact: true },
  { href: "/dashboard/events", label: "Event", icon: "catalog" },
  { href: "/dashboard/order", label: "Order", icon: "orders" },
  { href: "/dashboard/ticket", label: "Tiket", icon: "ticket" },
  { href: "/dashboard/notifications", label: "Notifikasi", icon: "bell" },
  { href: "/dashboard/profile", label: "Profil", icon: "user" },
  { href: "/dashboard/organizer/apply", label: "Ajukan Penyelenggara", icon: "userPlus" },
];

function pageTitle(pathname: string) {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname.startsWith("/dashboard/order")) return "Order saya";
  if (pathname.startsWith("/dashboard/ticket")) return "Tiket saya";
  if (pathname.startsWith("/dashboard/notifications")) return "Notifikasi";
  if (pathname.startsWith("/dashboard/profile")) return "Profil";
  if (pathname.startsWith("/dashboard/organizer/status") || pathname.startsWith("/organizer/status")) return "Status pengajuan";
  if (pathname.startsWith("/dashboard/organizer") || pathname.startsWith("/organizer/apply")) return "Ajukan Penyelenggara";
  if (pathname.startsWith("/dashboard/events") || pathname.startsWith("/events")) return "Event";
  return "Dashboard";
}

export function BuyerShell({ children }: { children: ReactNode }) {
  return (
    <WorkspaceShell
      nav={NAV}
      navAriaLabel="Menu pembeli"
      storageKey="mti-buyer-nav"
      titleForPath={pageTitle}
      notificationsHref="/dashboard/notifications"
      primaryHref="/dashboard/events"
      primaryLabel="Lihat event"
    >
      {children}
    </WorkspaceShell>
  );
}
