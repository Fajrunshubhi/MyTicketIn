"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { WorkspaceShell, type WorkspaceNavItem } from "@/components/dashboard/WorkspaceShell";
import { type IconName } from "@/components/ui/Icon";

const NAV: WorkspaceNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" as IconName, exact: true },
  { href: "/dashboard/event", label: "Event", icon: "catalog" },
  { href: "/dashboard/petugas", label: "Petugas", icon: "devices" },
  { href: "/dashboard/event/new", label: "Buat event", icon: "userPlus", exact: true },
  { href: "/dashboard/pembeli", label: "Pembeli", icon: "ticket" },
  { href: "/dashboard/laporan", label: "Laporan", icon: "chart" },
  { href: "/dashboard/refunds", label: "Refund", icon: "orders" },
  { href: "/dashboard/notifications", label: "Notifikasi", icon: "bell" },
  { href: "/dashboard/profile", label: "Profil", icon: "user" },
];

function pageTitle(pathname: string): string {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname === "/dashboard/laporan") return "Laporan";
  if (pathname.startsWith("/dashboard/refunds")) return "Refund";
  if (pathname === "/dashboard/pembeli") return "Pembeli";
  if (pathname === "/dashboard/petugas") return "Akun petugas";
  if (pathname === "/dashboard/event") return "Event";
  if (pathname === "/dashboard/event/new") return "Buat event";
  if (pathname.endsWith("/preview")) return "Pratinjau privat";
  if (pathname.endsWith("/staff")) return "Kelola petugas";
  if (pathname.endsWith("/scanner")) return "Scanner check-in";
  if (pathname.endsWith("/check-in-attempts")) return "Riwayat check-in";
  if (pathname.startsWith("/dashboard/event/")) return "Detail event";
  if (pathname.startsWith("/dashboard/organizer")) return "Status akun";
  if (pathname.startsWith("/dashboard/notifications")) return "Notifikasi";
  if (pathname.startsWith("/dashboard/profile")) return "Profil";
  return "Dashboard";
}

export function OrganizerShell({ children, canWrite = true }: { children: ReactNode; canWrite?: boolean }) {
  const pathname = usePathname() || "/dashboard";
  const authoring = pathname === "/dashboard/event/new";
  const nav = canWrite ? NAV : NAV.filter((item) => item.href !== "/dashboard/event/new");
  return (
    <WorkspaceShell
      nav={[
        ...nav,
        { href: "/dashboard/organizer/status", label: "Status akun", icon: "shield" as IconName },
      ]}
      navAriaLabel="Menu penyelenggara"
      storageKey="mti-organizer-nav"
      titleForPath={pageTitle}
      searchPlaceholder={authoring ? undefined : "Cari event, kota, atau venue"}
      searchPath={authoring ? undefined : (q) => (q ? `/dashboard/event?q=${encodeURIComponent(q)}` : "/dashboard/event")}
      notificationsHref="/dashboard/notifications"
      primaryHref={!canWrite ? "/dashboard/organizer/status" : authoring ? undefined : "/dashboard/event/new"}
      primaryLabel={!canWrite ? "Sanggahan" : authoring ? undefined : "+ Buat event"}
    >
      {!canWrite ? (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Akun penyelenggara ditangguhkan. Event, laporan, dan data lama tetap terlihat. Aksi baru (buat event, ubah, ajukan) ditahan sampai admin memulihkan.{" "}
          <a className="font-semibold underline-offset-2 hover:underline" href="/dashboard/organizer/status">
            Kirim sanggahan
          </a>
        </div>
      ) : null}
      {children}
    </WorkspaceShell>
  );
}
