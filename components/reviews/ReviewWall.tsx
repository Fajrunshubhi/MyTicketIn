import Link from "next/link";
import { initials, StarRating } from "@/components/reviews/StarRating";
import { formatEventRating } from "@/lib/reviews-format";
import type { EventReview } from "@/lib/server/reviews";

function padRow(items: EventReview[], min = 3): EventReview[] {
  if (!items.length) return [];
  const out = [...items];
  while (out.length < min) out.push(...items);
  return out;
}

function ReviewCard({ item }: { item: EventReview }) {
  return (
    <article className="flex h-full min-h-[13.5rem] flex-col rounded-2xl border border-stone-100 bg-white p-5 shadow-[0_18px_40px_-28px_rgba(28,22,54,0.45)]">
      <StarRating value={item.rating} />
      <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-ink/80">“{item.comment}”</p>
      <p className="mt-auto flex items-center gap-3 pt-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eee8ff] text-xs font-semibold text-gold-800">
          {initials(item.authorName)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold uppercase tracking-wide text-ink">{item.authorName}</span>
          <Link href={`/events/${item.eventSlug}`} className="mt-0.5 block truncate text-xs text-gold-800 hover:underline">
            {item.eventTitle}
          </Link>
          <span className="block truncate text-xs text-ink/55">Penyelenggara {item.organizerName}</span>
          <span className="mt-1 block truncate text-xs text-ink/70">
            Rating event: {formatEventRating({ average: item.eventRatingAverage, count: item.eventRatingCount })}
          </span>
        </span>
      </p>
    </article>
  );
}

function MarqueeRow({ items, direction }: { items: EventReview[]; direction: "left" | "right" }) {
  const sequence = padRow(items, 3);
  const loop = [...sequence, ...sequence];
  return (
    <div className="review-marquee-viewport overflow-hidden">
      <ul className={`review-marquee-track flex w-max gap-5 ${direction === "right" ? "review-marquee-right" : "review-marquee-left"}`}>
        {loop.map((item, index) => (
          <li key={`${item.id}-${direction}-${index}`} className="review-marquee-card shrink-0">
            <ReviewCard item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReviewWall({ items }: { items: EventReview[] }) {
  if (!items.length) {
    return (
      <p className="mt-8 text-center text-ink/65">
        Belum ada ulasan. Pembeli tiket dapat memberi rating dan komentar pada halaman event.
      </p>
    );
  }
  const rowOne = items.filter((_, i) => i % 2 === 0);
  const rowTwo = items.filter((_, i) => i % 2 === 1);
  return (
    <div className="mt-10 space-y-5" aria-label="Ulasan pengunjung">
      <MarqueeRow items={rowOne} direction="right" />
      <MarqueeRow items={rowTwo.length ? rowTwo : rowOne} direction="left" />
    </div>
  );
}
