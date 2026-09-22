"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { SiteNav, type SiteNavItem } from "@/components/shared/SiteNav";

export function AppHeader({
  homeHref = "/",
  items = [],
  trailing,
  showLogout = true,
}: {
  homeHref?: string;
  items?: SiteNavItem[];
  trailing?: ReactNode;
  showLogout?: boolean;
}) {
  return (
    <SiteNav
      brand={
        <Link href={homeHref} className="block min-w-0">
          <BrandMark compact />
        </Link>
      }
      items={items}
      trailing={trailing}
      showLogout={showLogout}
    />
  );
}
