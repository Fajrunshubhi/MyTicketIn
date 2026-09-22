"use client";

import Link from "next/link";
import { formatRupiah } from "@/lib/format";
import { SALE_LABEL, type CatalogCard } from "@/components/events/catalog-types";
import { Icon } from "@/components/ui/Icon";

function cardDate(iso: string, timeZone: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { month: "—", day: "—" };
  }
  const month = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone }).format(date).replace(".", "").toUpperCase();
  const day = new Intl.DateTimeFormat("id-ID", { day: "2-digit", timeZone }).format(date);
  return { month, day };
}

export function EventCard({ item }: { item: CatalogCard }) {
  const price =
    item.priceFromRupiah === 0 ? "Gratis" : item.priceFromRupiah != null ? formatRupiah(item.priceFromRupiah) : "Harga menyusul";
  const { month, day } = cardDate(item.startsAt, item.timezone);
  return (
    <li className="overflow-hidden rounded-[22px] bg-paper shadow-[0_18px_40px_-28px_rgba(28,22,54,0.55)]">
      <Link
        href={`/events/${item.slug}`}
        className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
      >
        <div className="relative">
          <img
            src={item.image?.url || "/dummy-events/jazz-1.jpg"}
            alt={item.image?.alt || item.title}
            width={640}
            height={360}
            className="h-[190px] w-full bg-stone-200 object-cover"
            onError={(event) => {
              const el = event.currentTarget;
              if (el.dataset.fallback === "1") return;
              el.dataset.fallback = "1";
              el.src = "/dummy-events/jazz-1.jpg";
            }}
          />
          <span className="absolute left-3 top-3 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-ink shadow-soft">
            {price}
          </span>
        </div>
        <div className="flex gap-3 p-4">
          <div className="w-10 shrink-0 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gold-600">{month}</p>
            <p className="text-xl font-semibold leading-none text-ink">{day}</p>
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-ink">{item.title}</h2>
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-ink/55">
              <Icon name="pin" className="h-3 w-3 shrink-0" />
              {item.city}
            </p>
            <p className="mt-1 text-xs text-ink/50">
              {item.category} · {SALE_LABEL[item.saleStatus] || item.saleStatus}
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}
