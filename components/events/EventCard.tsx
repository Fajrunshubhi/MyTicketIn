"use client";

import Link from "next/link";
import { formatClock, formatDateTime, formatRupiah } from "@/lib/format";
import { SALE_LABEL, type CatalogCard } from "@/components/events/catalog-types";
import { EventCoverImg } from "@/components/events/EventCoverImg";
import { Icon } from "@/components/ui/Icon";
import { StarRating } from "@/components/reviews/StarRating";
import { formatEventRating } from "@/lib/reviews-format";

function cardWhen(iso: string, timeZone: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { month: "—", day: "—", clock: "—", full: "Waktu belum tersedia" };
  }
  const month = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone }).format(date).replace(".", "").toUpperCase();
  const day = new Intl.DateTimeFormat("id-ID", { day: "2-digit", timeZone }).format(date);
  return {
    month,
    day,
    clock: formatClock(iso, timeZone),
    full: formatDateTime(iso, timeZone),
  };
}

export function EventCard({ item }: { item: CatalogCard }) {
  const price =
    item.priceFromRupiah === 0 ? "Gratis" : item.priceFromRupiah != null ? formatRupiah(item.priceFromRupiah) : "Harga menyusul";
  const { month, day, clock, full } = cardWhen(item.startsAt, item.timezone);
  const rating = { average: item.ratingAverage || 0, count: item.ratingCount || 0 };
  const ratingLabel = rating.count
    ? `★ ${rating.average.toFixed(1).replace(".", ",")} · ${rating.count} ulasan`
    : "Belum ada rating";
  const showRatingBadge = rating.count > 0 || item.saleStatus === "PAST";
  const past = item.saleStatus === "PAST";
  return (
    <li className="overflow-hidden rounded-[22px] bg-paper shadow-[0_18px_40px_-28px_rgba(28,22,54,0.55)]">
      <Link
        href={`/events/${item.slug}`}
        className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
      >
        <div className="relative">
          <EventCoverImg
            src={item.image?.url}
            alt={item.image?.alt || item.title}
            category={item.category}
            title={item.title}
            seed={item.slug}
            width={640}
            height={360}
            className={`h-[190px] w-full bg-stone-200 object-cover ${past ? "brightness-[0.72]" : ""}`}
          />
          {past ? <span className="pointer-events-none absolute inset-0 bg-[#1c1636]/30" aria-hidden /> : null}
          <span className="absolute left-3 top-3 z-10 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-ink shadow-soft">
            {price}
          </span>
          {showRatingBadge ? (
            <span className="absolute right-3 top-3 z-10 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-gold-800 shadow-soft">
              {ratingLabel}
            </span>
          ) : null}
        </div>
        <div className="flex gap-3 p-4">
          <div className="w-12 shrink-0 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gold-600">{month}</p>
            <p className="text-xl font-semibold leading-none text-ink">{day}</p>
            <p className="mt-1 text-[10px] font-semibold leading-tight text-ink/70">{clock}</p>
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-ink">{item.title}</h2>
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-ink/55">
              <Icon name="clock" className="h-3 w-3 shrink-0" />
              <time dateTime={item.startsAt}>{full}</time>
            </p>
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-ink/55">
              <Icon name="pin" className="h-3 w-3 shrink-0" />
              {item.city}
            </p>
            <p className="mt-1 text-xs text-ink/50">
              {item.category} · {SALE_LABEL[item.saleStatus] || item.saleStatus}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2">
              <StarRating className="text-xs text-gold-700" value={rating.count ? rating.average : 0} />
              <p className="text-xs font-medium text-gold-800">{formatEventRating(rating)}</p>
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}
