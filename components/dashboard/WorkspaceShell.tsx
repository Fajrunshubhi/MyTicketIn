"use client";

import { FormEvent, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import LogoutButton from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { ProfileMenu } from "@/components/shared/ProfileMenu";
import { Icon, type IconName } from "@/components/ui/Icon";

export type WorkspaceNavItem = {
  href: string;
  label: string;
  icon: IconName;
  exact?: boolean;
};

function navActive(pathname: string, item: WorkspaceNavItem): boolean {
  if (item.exact || item.href.split("/").filter(Boolean).length <= 1) {
    return pathname === item.href;
  }
  if (item.href === "/dashboard/event") {
    return pathname === "/dashboard/event" || (pathname.startsWith("/dashboard/event/") && pathname !== "/dashboard/event/new");
  }
  if (item.href === "/dashboard") {
    return pathname === "/dashboard";
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function isDesktopNav() {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
}

function NavLinks({
  pathname,
  nav,
  onNavigate,
  labeled,
}: {
  pathname: string;
  nav: WorkspaceNavItem[];
  onNavigate?: () => void;
  labeled: boolean;
}) {
  return (
    <>
      {nav.map((item) => {
        const active = navActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
            title={labeled ? undefined : item.label}
            className={
              labeled
                ? `inline-flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm font-medium ${
                    active ? "bg-gold-500 text-white" : "text-ink/70 hover:bg-stone-100"
                  }`
                : `inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl ${
                    active ? "bg-gold-500 text-white" : "text-ink/45 hover:bg-stone-100 hover:text-ink"
                  }`
            }
          >
            <Icon name={item.icon} className="h-5 w-5 shrink-0" />
            {labeled ? <span className="truncate">{item.label}</span> : null}
          </Link>
        );
      })}
    </>
  );
}

export function WorkspaceShell({
  children,
  nav,
  navAriaLabel,
  storageKey,
  titleForPath,
  searchPlaceholder,
  searchPath,
  notificationsHref,
  primaryHref,
  primaryLabel,
}: {
  children: ReactNode;
  nav: WorkspaceNavItem[];
  navAriaLabel: string;
  storageKey: string;
  titleForPath: (pathname: string) => string;
  searchPlaceholder: string;
  searchPath: (query: string) => string;
  notificationsHref: string;
  primaryHref?: string;
  primaryLabel?: string;
}) {
  const pathname = usePathname() || "/dashboard";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const [query, setQuery] = useState("");
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      setWide(localStorage.getItem(storageKey) === "wide");
    } catch {
      setWide(false);
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, wide ? "wide" : "narrow");
    } catch {
      /* ignore */
    }
  }, [storageKey, wide]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(searchPath(query.trim()));
  }

  function onToggleNav() {
    if (isDesktopNav()) {
      setWide((cur) => !cur);
      return;
    }
    setOpen((cur) => !cur);
  }

  const title = titleForPath(pathname);
  const toggleExpanded = open || wide;
  const toggleLabel = isDesktopNav() ? (wide ? "Ciutkan menu" : "Bentangkan menu") : open ? "Tutup menu" : "Buka menu";

  return (
    <div className="flex h-dvh min-h-0 w-full bg-[#f7f8fd]">
      <aside
        className={`hidden h-full shrink-0 flex-col border-r border-stone-200 bg-white py-4 transition-[width] duration-200 ease-out lg:flex ${
          wide ? "w-60 px-3" : "w-[4.75rem] px-2"
        }`}
      >
        <div className={`flex items-center ${wide ? "justify-between gap-2 px-1" : "flex-col gap-3"}`}>
          <Link
            href="/"
            className={`inline-flex min-h-11 items-center gap-2 font-semibold text-ink ${wide ? "" : "justify-center"}`}
            aria-label="Beranda MyTicketIn"
          >
            <BrandMark markOnly />
            {wide ? <span className="truncate">MyTicketIn</span> : null}
          </Link>
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-ink/70 hover:bg-stone-100"
            aria-pressed={wide}
            aria-label={wide ? "Ciutkan menu" : "Bentangkan menu"}
            onClick={() => setWide((cur) => !cur)}
          >
            <Icon name="chevron" className={`h-5 w-5 ${wide ? "rotate-90" : "-rotate-90"}`} />
          </button>
        </div>
        <nav className={`mt-6 flex flex-1 flex-col gap-1 ${wide ? "" : "items-center"}`} aria-label={navAriaLabel}>
          <NavLinks pathname={pathname} nav={nav} labeled={wide} />
        </nav>
        <div className={wide ? "px-0" : "flex justify-center"}>
          <LogoutButton compact={!wide} className={`border-0 bg-transparent ${wide ? "w-full justify-start px-3" : "min-w-11 justify-center px-2"}`} />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-[#f7f8fd]/95 px-3 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              ref={buttonRef}
              type="button"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-stone-200 bg-white text-ink"
              aria-expanded={toggleExpanded}
              aria-controls={panelId}
              aria-label={toggleLabel}
              onClick={onToggleNav}
            >
              <Icon name={open ? "close" : "menu"} className="h-5 w-5" />
            </button>
            <h1 className="min-w-0 flex-1 truncate font-display text-xl text-ink sm:text-2xl lg:flex-none lg:text-3xl">{title}</h1>
            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
              {primaryHref && primaryLabel ? (
                <Link
                  href={primaryHref}
                  className="hidden min-h-11 items-center justify-center rounded-full bg-gold-500 px-4 text-sm font-semibold text-white sm:inline-flex"
                >
                  {primaryLabel}
                </Link>
              ) : null}
              <NotificationBell compact href={notificationsHref} />
              <ProfileMenu appearance="chip" />
            </div>
          </div>
          <form onSubmit={onSearch} className="mt-3">
            <label className="relative block">
              <span className="sr-only">{searchPlaceholder}</span>
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-11 w-full rounded-full border border-stone-200 bg-white pl-10 pr-4 text-sm text-ink outline-none focus:ring-2"
              />
            </label>
          </form>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6 lg:px-8">{children}</div>
      </div>

      {open ? (
        <>
          <button type="button" className="fixed inset-0 z-40 bg-ink/40 lg:hidden" aria-label="Tutup menu" onClick={() => setOpen(false)} />
          <aside ref={panelRef} id={panelId} className="fixed inset-y-0 left-0 z-50 flex w-[min(18rem,88vw)] flex-col bg-white p-4 shadow-card lg:hidden">
            <div className="flex items-center justify-between gap-2">
              <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-semibold text-ink" onClick={() => setOpen(false)}>
                <BrandMark markOnly />
                MyTicketIn
              </Link>
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-stone-200"
                aria-label="Tutup menu"
                onClick={() => {
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>
            <nav className="mt-6 flex flex-col gap-1" aria-label={navAriaLabel}>
              <NavLinks pathname={pathname} nav={nav} labeled onNavigate={() => setOpen(false)} />
            </nav>
            {primaryHref && primaryLabel ? (
              <Link
                href={primaryHref}
                onClick={() => setOpen(false)}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-gold-500 px-4 text-sm font-semibold text-white sm:hidden"
              >
                {primaryLabel}
              </Link>
            ) : null}
            <div className="mt-auto pt-4">
              <LogoutButton className="w-full justify-center" />
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
