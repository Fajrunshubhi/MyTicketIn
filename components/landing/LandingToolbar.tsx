"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

type Props = {
  categories: string[];
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

const pill =
  "min-h-11 appearance-none rounded-full border border-stone-200 bg-white py-2 pl-4 pr-9 text-sm text-ink/80 outline-none focus:border-gold-400";

export function LandingToolbar({ categories }: Props) {
  const router = useRouter();

  function go(updates: Record<string, string>) {
    const sp = new URLSearchParams();
    Object.entries(updates).forEach(([k, v]) => {
      if (v) sp.set(k, v);
    });
    router.push(sp.toString() ? `/events?${sp.toString()}` : "/events");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative">
        <span className="sr-only">Filter waktu</span>
        <select
          className={pill}
          defaultValue=""
          onChange={(event) => {
            const now = new Date();
            if (event.target.value === "today") {
              go({ dateFrom: isoDate(now), dateTo: isoDate(now), sort: "soonest" });
              return;
            }
            if (event.target.value === "week") {
              const end = new Date(now);
              end.setDate(end.getDate() + 7);
              go({ dateFrom: isoDate(now), dateTo: isoDate(end), sort: "soonest" });
              return;
            }
            go({ sort: "soonest" });
          }}
        >
          <option value="">Semua tanggal</option>
          <option value="today">Hari ini</option>
          <option value="week">Minggu ini</option>
        </select>
        <Icon name="chevron" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
      </label>
      <label className="relative">
        <span className="sr-only">Urutan</span>
        <select
          className={pill}
          defaultValue="soonest"
          onChange={(event) => go({ sort: event.target.value })}
        >
          <option value="soonest">Terdekat</option>
          <option value="newest">Terbaru</option>
        </select>
        <Icon name="chevron" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
      </label>
      <label className="relative">
        <span className="sr-only">Kategori</span>
        <select
          className={pill}
          defaultValue=""
          onChange={(event) => go({ category: event.target.value, sort: "soonest" })}
        >
          <option value="">Semua kategori</option>
          {categories.map((category) => (
            <option key={category} value={category.toLowerCase()}>
              {category}
            </option>
          ))}
        </select>
        <Icon name="chevron" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
      </label>
    </div>
  );
}
