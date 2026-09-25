import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { SiteFooter } from "@/components/shared/SiteFooter";
import { SiteHeader } from "@/components/shared/SiteHeader";
import { EventCard } from "@/components/events/EventCard";
import { LandingToolbar } from "@/components/landing/LandingToolbar";
import type { CatalogCard } from "@/components/events/catalog-types";
import { listCatalog, listFilters } from "@/lib/server/catalog";
import { eventImageSrc } from "@/lib/event-cover";
import { loadSessionUser } from "@/lib/session";

async function loadUpcoming(): Promise<{ items: CatalogCard[]; unavailable: boolean }> {
  try {
    const result = await listCatalog({
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

async function loadFilterOptions(): Promise<{ categories: string[]; cities: string[] }> {
  try {
    const data = await listFilters();
    const cities = [...new Set((data.locations || []).map((item) => item.city).filter(Boolean))];
    return { categories: data.categories || [], cities };
  } catch {
    return { categories: [], cities: [] };
  }
}

const field =
  "mt-0.5 w-full border-0 bg-transparent p-0 text-[15px] font-medium text-white outline-none placeholder:font-normal placeholder:text-white/45";

export default async function PlatformPage() {
  const [upcoming, filters, user] = await Promise.all([loadUpcoming(), loadFilterOptions(), loadSessionUser()]);
  const items = upcoming.items;
  const heroImage = items[0]?.image;

  return (
    <div className="min-h-screen bg-[#fbfafd]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6">

        <section className="relative pb-8">
          <div className="relative min-h-[360px] overflow-hidden rounded-[32px] sm:min-h-[420px]">
            {heroImage ? (
              <img
                src={eventImageSrc(heroImage.url, items[0]?.category, items[0]?.title, items[0]?.slug)}
                alt={heroImage.alt}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="hero-stage absolute inset-0" />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-[#1c1636]/85 via-[#1c1636]/35 to-transparent" />
            <div className="relative flex min-h-[360px] flex-col justify-center px-6 py-16 text-white sm:min-h-[420px] sm:px-14">
              <h1 className="max-w-lg text-4xl font-semibold uppercase leading-[1.05] tracking-tight sm:text-6xl">
                MyTicketIn
              </h1>
              <p className="mt-4 max-w-sm text-base text-white/85 sm:text-lg">Untuk yang datang, menonton, dan berkumpul <br />Ticketing Event untuk Pemesanan, Pembayaran, dan Validasi Peserta</p> 
              
            </div>
          </div>

          <form
            action="/events"
            className="relative z-10 mx-auto -mt-9 grid w-[min(100%,920px)] gap-3 rounded-[28px] bg-[#231b42] px-5 py-4 text-white shadow-[0_24px_50px_-28px_rgba(28,22,54,0.75)] [color-scheme:dark] sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-center sm:px-6"
          >
            <label className="block min-w-0 text-[11px] text-white/50">
              Mencari
              <input name="q" placeholder="Nama event" className={field} />
            </label>
            <label className="block min-w-0 border-white/10 text-[11px] text-white/50 sm:border-l sm:pl-5">
              Di
              <select name="city" defaultValue="" className={`${field} cursor-pointer`}>
                <option value="">Semua lokasi</option>
                {filters.cities.map((city) => (
                  <option key={city} value={city.toLowerCase()}>
                    {city}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0 border-white/10 text-[11px] text-white/50 sm:border-l sm:pl-5">
              Kapan
              <input type="date" name="dateFrom" className={`${field} [color-scheme:dark]`} />
            </label>
            <button
              type="submit"
              className="flex h-12 w-12 items-center justify-center justify-self-end rounded-full bg-gold-500 text-white shadow-soft"
              aria-label="Cari katalog"
            >
              <Icon name="search" className="h-5 w-5" />
            </button>
          </form>
        </section>

        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-[2rem] font-semibold tracking-tight text-ink sm:text-4xl">Event mendatang</h2>
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
