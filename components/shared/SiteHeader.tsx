import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { loadSessionUser } from "@/lib/session";
import { ProfileMenu } from "@/components/shared/ProfileMenu";
import { SiteNav, type SiteNavItem } from "@/components/shared/SiteNav";

export async function SiteHeader() {
  const user = await loadSessionUser();
  const items: SiteNavItem[] = user
    ? user.access?.kind === "staff"
      ? [
          { href: "/petugas", label: "Scanner", icon: "devices", emphasis: true },
        ]
      : [
          { href: "/events", label: "Katalog", icon: "catalog" },
          { href: "/dashboard", label: "Dashboard", icon: "dashboard", emphasis: true },
        ]
    : [
        { href: "/events", label: "Katalog", icon: "catalog" },
        { href: "/login?portal=buyer", label: "Masuk pembeli", icon: "login" },
        { href: "/login?portal=staff", label: "Masuk petugas", icon: "devices" },
        { href: "/register", label: "Daftar", icon: "userPlus", emphasis: true },
      ];

  return (
    <SiteNav
      brand={
        <Link href="/" className="inline-flex min-h-11 min-w-0 items-center gap-2 text-lg font-semibold tracking-tight text-ink">
          <Icon name="catalog" className="h-5 w-5 shrink-0 text-gold-600" />
          <span className="truncate">MyTicketIn</span>
        </Link>
      }
      items={items}
      trailing={user ? <ProfileMenu /> : undefined}
      showLogout={Boolean(user)}
    />
  );
}
