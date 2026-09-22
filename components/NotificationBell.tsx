"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export function NotificationBell({ compact = false, href = "/notifications" }: { compact?: boolean; href?: string }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/me/notifications?filter=unread&limit=1", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          setCount(0);
          return;
        }
        const body = await res.json();
        setCount(Number(body.data?.unreadCount || 0));
      })
      .catch(() => setCount(0));
  }, []);
  const label = count && count > 0 ? `Notifikasi, ${count} belum dibaca` : "Notifikasi";
  return (
    <Link
      href={href}
      className={`relative inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full text-sm font-medium text-gold-700 hover:bg-white ${compact ? "px-2" : "px-3 py-2"}`}
      aria-label={label}
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
    </Link>
  );
}
