"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { formatLiveClock, formatLiveClockDate } from "@/lib/format";

const ZONE = "Asia/Jakarta";

export function LiveClock({
  global = false,
  className = "",
}: {
  global?: boolean;
  className?: string;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const dateLabel = now ? formatLiveClockDate(now, ZONE) : "—";
  const timeLabel = now ? formatLiveClock(now, ZONE, true) : "—";
  const fullLabel = now ? formatLiveClock(now, ZONE) : "Waktu Asia/Jakarta";

  return (
    <p
      data-live-clock={global ? "global" : "host"}
      className={`inline-flex min-h-9 items-center gap-1.5 tabular-nums text-ink/75 ${className}`}
      title={fullLabel}
    >
      <Icon name="clock" className="h-3.5 w-3.5 shrink-0 text-gold-700" />
      <time
        dateTime={now ? now.toISOString() : undefined}
        className="flex min-w-0 flex-col items-end leading-tight sm:flex-row sm:items-baseline sm:gap-1.5"
      >
        <span className="whitespace-nowrap text-[11px] font-medium sm:text-xs">{dateLabel}</span>
        <span className="whitespace-nowrap text-xs font-semibold sm:text-sm">{timeLabel}</span>
      </time>
      <span className="sr-only">Waktu Indonesia bagian Barat, diperbarui setiap detik.</span>
    </p>
  );
}
