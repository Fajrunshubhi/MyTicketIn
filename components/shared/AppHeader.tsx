"use client";

import type { ReactNode } from "react";
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
        <BrandMark compact href={homeHref} />
      }
      items={items}
      trailing={trailing}
      showLogout={showLogout}
    />
  );
}
