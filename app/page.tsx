import Link from "next/link";
import { SiteFooter } from "@/components/shared/SiteFooter";
import { SiteHeader } from "@/components/shared/SiteHeader";
import { EventCard } from "@/components/events/EventCard";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingSearch } from "@/components/landing/LandingSearch";
import { LandingToolbar } from "@/components/landing/LandingToolbar";
import type { CatalogCard } from "@/components/events/catalog-types";
import { listCatalog, listFilters, listHeroSlides, listPastCatalog } from "@/lib/server/catalog";
import { listRecentReviews } from "@/lib/server/reviews";
import { listLandingOrganizers } from "@/lib/server/organizers";
import { ReviewWall } from "@/components/reviews/ReviewWall";
import { OrganizerPartners } from "@/components/landing/OrganizerPartners";
import { loadSessionUser } from "@/lib/session";
import { cachedPublic } from "@/lib/server/public-cache";

// Errors are thrown out of the cached function (and so never cached); the loaders below turn them into the empty state.
const cachedCatalog = cachedPublic("landing-upcoming", listCatalog);
const cachedPast = cachedPublic("landing-past", listPastCatalog);
const cachedHero = cachedPublic("landing-hero", listHeroSlides);
const cachedFilters = cachedPublic("landing-filters", listFilters);
const cachedOrganizers = cachedPublic("landing-organizers", listLandingOrganizers);
const cachedReviews = cachedPublic("landing-reviews", listRecentReviews);

async function loadUpcoming(): Promise<{ items: CatalogCard[]; unavailable: boolean }> {
  try {
    const result = await cachedCatalog({
      q: "",
      category: "",
      city: "",
      province: "",
      tag: "",
      limit: 9,
    });
    return { items: result.items, unavailable: false };
  } catch {
    return { items: [], unavailable: true };
  }
}

async function loadPast(): Promise<{ items: CatalogCard[]; unavailable: boolean }> {
  try {
    const items = await cachedPast(3);
    return { items, unavailable: false };
  } catch {
    return { items: [], unavailable: true };
  }
}
async function loadHero(): Promise<CatalogCard[]> {
  try {
    return await cachedHero(6);
  } catch {
    return [];
  }
}

async function loadFilterOptions(): Promise<{ categories: string[]; cities: string[] }> {
  try {
    const data = await cachedFilters();
    const cities = [...new Set((data.locations || []).map((item) => item.city).filter(Boolean))];
    return { categories: data.categories || [], cities };
  } catch {
    return { categories: [], cities: [] };
  }
}

async function loadOrganizers() {
  try {
    return await cachedOrganizers(24);
  } catch {
    return [];
  }
}

async function loadReviews() {
  try {
    return await cachedReviews(12);
  } catch {
    return [];
  }
}

export default async function PlatformPage() {
  const [upcoming, past, filters, user, reviews, organizers, heroSlides] = await Promise.all([
    loadUpcoming(),
    loadPast(),
    loadFilterOptions(),
    loadSessionUser(),
    loadReviews(),
    loadOrganizers(),
    loadHero(),
  ]);
  const items = upcoming.items;
  const pastItems = past.items;

  return (
    <div className="min-h-screen bg-[#fbfafd]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6">

        <section className="relative pb-8">
          <LandingHero slides={heroSlides} />
          <LandingSearch cities={filters.cities} />
        </section>

        <section className="mt-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-4xl">Event mendatang</h2>
            <LandingToolbar categories={filters.categories} />
          </div>
          {upcoming.unavailable ? (
            <p className="mt-8 text-ink/65">Katalog sedang tidak tersedia. Muat ulang halaman sebentar lagi.</p>
          ) : items.length === 0 ? (
            <p className="mt-8 text-ink/65">Belum ada event yang dipublikasikan.</p>
          ) : (
            <ul className="mt-8 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <EventCard key={item.slug} item={item} />
              ))}
            </ul>
          )}
          <p className="mt-12 text-center">
            <Link
              href="/events"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#eee8ff] px-7 text-sm font-semibold text-gold-800"
            >
              Muat event lainnya
            </Link>
          </p>
        </section>

        <section className="mt-16" aria-labelledby="past-events-heading">
          <h2 id="past-events-heading" className="text-2xl font-semibold tracking-tight text-ink sm:text-4xl">
            Event yang telah selesai
          </h2>
          <p className="mt-2 max-w-2xl text-ink/65">Event yang sudah berlangsung. Tiket tidak lagi dijual.</p>
          {past.unavailable ? (
            <p className="mt-8 text-ink/65">Daftar event lampau sedang tidak tersedia.</p>
          ) : pastItems.length === 0 ? (
            <p className="mt-8 text-ink/65">Belum ada event yang selesai ditampilkan.</p>
          ) : (
            <ul className="mt-8 grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
              {pastItems.map((item) => (
                <EventCard key={item.slug} item={item} />
              ))}
            </ul>
          )}
          <p className="mt-12 text-center">
            <Link
              href="/events?when=past"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#eee8ff] px-7 text-sm font-semibold text-gold-800"
            >
              Lihat semua event yang telah selesai
            </Link>
          </p>
        </section>

        <section className="mt-16" aria-labelledby="partners-heading">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-gold-700">Kerja sama</p>
          <h2 id="partners-heading" className="mt-2 text-center text-2xl font-semibold tracking-tight text-ink sm:text-4xl">
            Penyelenggara yang bergabung
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-ink/65">
            Mitra event yang telah disetujui di MyTicketIn.
          </p>
          <OrganizerPartners items={organizers} />
          <p className="mt-12 text-center">
            <Link
              href="/organizers"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#eee8ff] px-7 text-sm font-semibold text-gold-800"
            >
              Lihat semua penyelenggara
            </Link>
          </p>
        </section>

        <section className="mt-16 pb-4" aria-labelledby="reviews-heading">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-gold-700">Ulasan pengunjung</p>
          <h2 id="reviews-heading" className="mt-2 text-center text-2xl font-semibold tracking-tight text-ink sm:text-4xl">
            Apa kata pembeli
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-ink/65">
            Rating dan komentar dari pembeli tiket, lengkap dengan nama event dan penyelenggaranya.
          </p>
          <ReviewWall items={reviews} />
        </section>

        <section className="mt-12">
          {user ? null : (
            <p className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
              <Link className="text-gold-700 underline-offset-2 hover:underline" href="/login?portal=organizer">
                Masuk penyelenggara
              </Link>
              <Link className="text-gold-700 underline-offset-2 hover:underline" href="/login?portal=admin">
                Masuk admin
              </Link>
            </p>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
