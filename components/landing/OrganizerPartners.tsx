import Link from "next/link";
import { initials } from "@/components/reviews/StarRating";
import type { LandingOrganizer } from "@/lib/server/organizers";

function padRow(items: LandingOrganizer[], min = 3): LandingOrganizer[] {
  if (!items.length) return [];
  const out = [...items];
  while (out.length < min) out.push(...items);
  return out;
}

export function OrganizerCard({ item }: { item: LandingOrganizer }) {
  return (
    <article className="flex h-full items-center gap-4 rounded-2xl border border-stone-100 bg-white px-5 py-4 shadow-[0_18px_40px_-28px_rgba(28,22,54,0.45)]">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#eee8ff] text-sm font-semibold text-gold-800">
        {initials(item.name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-ink">{item.name}</span>
        <span className="mt-0.5 block text-xs uppercase tracking-wide text-gold-700">Mitra terverifikasi</span>
        <span className="mt-1 block truncate text-xs text-ink/55">
          {item.eventCount > 0 ? `${item.eventCount} event dipublikasikan` : "Penyelenggara bergabung"}
        </span>
      </span>
    </article>
  );
}

export function OrganizerPartners({ items }: { items: LandingOrganizer[] }) {
  if (!items.length) {
    return (
      <p className="mt-8 text-center text-ink/65">Belum ada penyelenggara yang bergabung.</p>
    );
  }
  const sequence = padRow(items, 3);
  const loop = [...sequence, ...sequence];
  return (
    <div className="review-marquee-viewport mt-10 overflow-hidden">
      <ul className="review-marquee-track partner-marquee-alternate flex w-max gap-5">
        {loop.map((item, index) => (
          <li key={`${item.id}-${index}`} className="review-marquee-card shrink-0">
            <Link href={`/organizers/${item.id}`} className="block h-full">
              <OrganizerCard item={item} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
