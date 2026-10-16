"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DUMMY_EVENT_COVER, eventImageSrc } from "@/lib/event-cover";
import { formatDateTime, formatRupiah } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import type { CatalogCard } from "@/components/events/catalog-types";

const INTERVAL_MS = 6500;

export type HeroSlide = Pick<
  CatalogCard,
  "slug" | "title" | "category" | "city" | "startsAt" | "timezone" | "image" | "priceFromRupiah"
>;

export function LandingHero({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const current = slides[index];
  const canRotate = slides.length > 1;

  useEffect(() => {
    if (!canRotate || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [canRotate, paused, slides.length]);

  function go(delta: number) {
    setIndex((i) => (i + delta + slides.length) % slides.length);
  }

  const price = current
    ? current.priceFromRupiah === 0
      ? "Gratis"
      : current.priceFromRupiah != null
        ? `Mulai ${formatRupiah(current.priceFromRupiah)}`
        : "Harga menyusul"
    : "";

  return (
    <section
      className="relative overflow-hidden rounded-3xl sm:rounded-[32px]"
      aria-roledescription={canRotate ? "carousel" : undefined}
      aria-label="Event mendatang"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      {slides.length ? (
        slides.map((slide, i) => (
          <img
            key={slide.slug}
            src={eventImageSrc(slide.image?.url, slide.category, slide.title, slide.slug)}
            alt={slide.image?.alt || slide.title}
            width={1400}
            height={560}
            loading={i === 0 ? "eager" : "lazy"}
            decoding="async"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
              i === index ? "opacity-100" : "opacity-0"
            }`}
            onError={(event) => {
              const el = event.currentTarget;
              if (el.dataset.fallback === "1") return;
              el.dataset.fallback = "1";
              el.src = DUMMY_EVENT_COVER;
            }}
          />
        ))
      ) : (
        <div className="hero-stage absolute inset-0" />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-[#1c1636]/90 via-[#1c1636]/50 to-[#1c1636]/25 sm:via-[#1c1636]/45 sm:to-[#1c1636]/20" />

      <div className="relative flex min-h-[22rem] flex-col justify-end px-4 pb-16 pt-10 text-white sm:min-h-[28rem] sm:justify-center sm:px-14 sm:pb-24 sm:pt-14 lg:min-h-[30rem]">
        <h1 className="max-w-lg text-[2rem] font-semibold uppercase leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
          MyTicketIn
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/85 sm:mt-4 sm:text-lg">
          Untuk yang datang, menonton, dan berkumpul. Ticketing Event untuk Pemesanan, Pembayaran, dan Validasi Peserta
        </p>

        {current ? (
          <div className="mt-6 max-w-xl sm:mt-8" aria-live="polite">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-300">
              {current.category} · {current.city}
            </p>
            <p className="mt-1 line-clamp-2 text-lg font-semibold leading-snug sm:text-2xl">{current.title}</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/80 sm:text-sm">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="clock" className="h-3.5 w-3.5 shrink-0" />
                <time dateTime={current.startsAt}>{formatDateTime(current.startsAt, current.timezone)}</time>
              </span>
              <span>{price}</span>
            </p>
            <div className="mt-4 flex flex-col items-stretch gap-3 sm:mt-5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              <Link
                href={`/events/${current.slug}`}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-gold-500 px-6 text-sm font-semibold text-white shadow-soft hover:bg-gold-600"
              >
                Lihat detail event
              </Link>
              {canRotate ? (
                <div className="flex items-center justify-center gap-2 sm:justify-start" role="tablist" aria-label="Pilih slide event">
                  {slides.map((slide, i) => (
                    <button
                      key={slide.slug}
                      type="button"
                      role="tab"
                      aria-selected={i === index}
                      aria-label={`Event ${i + 1}: ${slide.title}`}
                      className={`h-2.5 rounded-full transition-all ${
                        i === index ? "w-7 bg-white" : "w-2.5 bg-white/45 hover:bg-white/75"
                      }`}
                      onClick={() => setIndex(i)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {canRotate ? (
          <div className="absolute right-6 top-1/2 z-10 hidden -translate-y-1/2 flex-col gap-2 sm:flex">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/35 text-white hover:bg-black/50"
              aria-label="Event sebelumnya"
              onClick={() => go(-1)}
            >
              <Icon name="chevron" className="h-4 w-4 -rotate-90 sm:rotate-180" />
            </button>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/35 text-white hover:bg-black/50"
              aria-label="Event berikutnya"
              onClick={() => go(1)}
            >
              <Icon name="chevron" className="h-4 w-4 rotate-90 sm:rotate-0" />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
