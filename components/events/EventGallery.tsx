"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { DUMMY_EVENT_COVER } from "@/lib/event-cover";

export type GalleryImage = { url: string; alt: string };

function markFallback(el: HTMLImageElement) {
  if (el.dataset.fallback === "1") return;
  el.dataset.fallback = "1";
  el.src = DUMMY_EVENT_COVER;
}

export function EventGallery({
  images,
  title,
  className = "",
}: {
  images: GalleryImage[];
  title: string;
  className?: string;
}) {
  const [broken, setBroken] = useState<Record<string, true>>({});
  const slides = useMemo(() => {
    const source = images.length > 0 ? images : [{ url: DUMMY_EVENT_COVER, alt: title }];
    const mapped = source.map((img) => (broken[img.url] ? { ...img, url: DUMMY_EVENT_COVER } : img));
    const seen = new Set<string>();
    return mapped.filter((img) => {
      if (seen.has(img.url)) return false;
      seen.add(img.url);
      return true;
    });
  }, [broken, images, title]);
  const [index, setIndex] = useState(0);
  const current = slides[Math.min(index, slides.length - 1)] || { url: DUMMY_EVENT_COVER, alt: title };
  const many = slides.length > 1;

  function go(next: number) {
    const len = slides.length;
    if (len < 1) return;
    setIndex(((next % len) + len) % len);
  }

  return (
    <div className={`overflow-hidden rounded-[28px] bg-[#1c1636] ${className}`}>
      <div className="relative">
        <img
          src={current.url}
          alt={current.alt || title}
          className="aspect-[16/9] h-auto w-full object-cover"
          onError={(event) => {
            const url = current.url;
            markFallback(event.currentTarget);
            if (url !== DUMMY_EVENT_COVER) setBroken((cur) => ({ ...cur, [url]: true }));
          }}
        />
        {many ? (
          <>
            <button
              type="button"
              className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-card"
              aria-label="Gambar sebelumnya"
              onClick={() => go(index - 1)}
            >
              <Icon name="chevron" className="h-5 w-5 -rotate-90" />
            </button>
            <button
              type="button"
              className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-card"
              aria-label="Gambar berikutnya"
              onClick={() => go(index + 1)}
            >
              <Icon name="chevron" className="h-5 w-5 rotate-90" />
            </button>
            <p className="sr-only" aria-live="polite">
              Gambar {index + 1} dari {slides.length}
            </p>
          </>
        ) : null}
      </div>
      {many ? (
        <ul className="flex gap-2 overflow-x-auto bg-[#1c1636] p-3" aria-label="Pilih gambar event">
          {slides.map((slide, i) => (
            <li key={`${slide.url}-${i}`}>
              <button
                type="button"
                aria-label={`Gambar ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => setIndex(i)}
                className={`block overflow-hidden rounded-xl border-2 ${i === index ? "border-gold-400" : "border-transparent opacity-70"}`}
              >
                <img
                  src={slide.url}
                  alt=""
                  className="h-14 w-20 object-cover"
                  onError={(event) => {
                    markFallback(event.currentTarget);
                    if (slide.url !== DUMMY_EVENT_COVER) setBroken((cur) => ({ ...cur, [slide.url]: true }));
                  }}
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
