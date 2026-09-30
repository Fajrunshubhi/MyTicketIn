"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { pingNotificationsLive, subscribeNotificationsLive } from "@/lib/notifications-live";
import { NotificationHoverItem, type NotificationHoverData } from "@/components/notifications/NotificationHoverItem";

type ListPayload = {
  items?: NotificationHoverData[];
  unreadCount?: number;
};

export function NotificationBell({ compact = false, href = "/dashboard/notifications" }: { compact?: boolean; href?: string }) {
  const [count, setCount] = useState<number | null>(null);
  const [items, setItems] = useState<NotificationHoverData[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const panelId = useId();

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch("/api/me/notifications?filter=all&limit=8", { credentials: "include", cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          setCount(0);
          setItems([]);
          return;
        }
        const body = (await res.json()) as { data?: ListPayload };
        setCount(Number(body.data?.unreadCount || 0));
        setItems(body.data?.items || []);
      } catch {
        if (!cancelled) {
          setCount(0);
          setItems([]);
        }
      }
    }
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 4000);
    const stop = subscribeNotificationsLive(refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      stop();
    };
  }, []);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function cancelClose() {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
    }
  }

  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  }

  const label = count && count > 0 ? `Notifikasi, ${count} belum dibaca` : "Notifikasi";

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className={`relative inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full text-sm font-medium text-gold-700 hover:bg-white ${compact ? "px-2" : "px-3 py-2"}`}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        onClick={() => {
          cancelClose();
          setOpen((cur) => !cur);
        }}
      >
        <span className="relative">
          <Icon name="bell" />
          {count && count > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 min-w-[1.1rem] rounded-full bg-gold-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </span>
        {compact ? null : "Notifikasi"}
      </button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Pratinjau notifikasi"
          className="absolute right-0 z-[70] mt-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-stone-200 bg-white p-2 shadow-card"
        >
          {items.length === 0 ? (
            <p className="px-3 py-6 text-sm text-ink/65">Belum ada notifikasi.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <NotificationHoverItem
                    item={item}
                    fallbackHref={href}
                    compact
                    onNavigate={() => {
                      setOpen(false);
                      pingNotificationsLive();
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
          <Link
            href={href}
            className="mt-1 inline-flex min-h-11 w-full items-center justify-center rounded-xl px-3 text-sm font-semibold text-gold-800 hover:bg-gold-50"
            onClick={() => {
              setOpen(false);
              pingNotificationsLive();
            }}
          >
            Lihat semua
          </Link>
        </div>
      ) : null}
    </div>
  );
}
