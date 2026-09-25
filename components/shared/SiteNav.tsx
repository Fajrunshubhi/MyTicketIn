"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import { AdminLifecycleAlerts } from "@/components/admin/AdminLifecycleAlerts";
import { Icon, type IconName } from "@/components/ui/Icon";

export type SiteNavItem = {
  href: string;
  label: string;
  icon?: IconName;
  emphasis?: boolean;
};

const itemClass =
  "inline-flex min-h-11 w-full items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-ink/80 hover:bg-white md:w-auto";
const emphasisClass =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-gold-100 px-4 py-2 text-sm font-semibold text-gold-800 md:w-auto";

export function SiteNav({
  brand,
  items,
  trailing,
  showLogout = false,
}: {
  brand: ReactNode;
  items: SiteNavItem[];
  trailing?: ReactNode;
  showLogout?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    function onResize() {
      if (window.matchMedia("(min-width: 768px)").matches) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const first = panelRef.current?.querySelector<HTMLElement>("a, button");
    first?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  const links = items.map((item) => (
    <Link
      key={item.href + item.label}
      href={item.href}
      className={item.emphasis ? emphasisClass : itemClass}
      onClick={() => setOpen(false)}
    >
      {item.icon ? <Icon name={item.icon} className="h-4 w-4 shrink-0" /> : null}
      {item.label}
    </Link>
  ));

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 bg-[#fbfafd]">
        <div className="mx-auto flex w-full max-w-6xl min-w-0 items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-5">
          <div className="min-w-0 shrink">{brand}</div>
          <nav className="hidden min-w-0 items-center justify-end gap-2 md:flex" aria-label="Navigasi utama">
            {links}
            {trailing}
            {showLogout ? <LogoutButton /> : null}
          </nav>
          <button
            ref={buttonRef}
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-stone-200 bg-white text-ink md:hidden"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? "Tutup menu" : "Buka menu"}
            onClick={() => setOpen((cur) => !cur)}
          >
            <Icon name={open ? "close" : "menu"} className="h-5 w-5" />
          </button>
        </div>
        {open ? (
          <div
            ref={panelRef}
            id={panelId}
            className="border-b border-stone-200 bg-paper px-4 py-4 shadow-card md:hidden"
          >
            <nav className="flex flex-col gap-2" aria-label="Navigasi utama">
              {links}
              {trailing ? <div className="px-1">{trailing}</div> : null}
              {showLogout ? <LogoutButton className="w-full justify-center" /> : null}
            </nav>
          </div>
        ) : null}
      </header>
      {open ? (
        <button type="button" className="fixed inset-0 z-40 bg-ink/30 md:hidden" aria-label="Tutup menu" onClick={close} />
      ) : null}
      <div className="h-[4.25rem] sm:h-[5.25rem]" aria-hidden="true" />
      <AdminLifecycleAlerts />
    </>
  );
}
