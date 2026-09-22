"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

export type GalleryImage = { url: string; alt: string };

export function EventGallery({
  images,
  title,
  className = "",
}: {
  images: GalleryImage[];
  title: string;
  className?: string;
}) {
  const slides = images.length > 0 ? images : [{ url: "/placeholder-event.svg", alt: title }];
  const [index, setIndex] = useState(0);
  const current = slides[Math.min(index, slides.length - 1)];
  const many = slides.length > 1;

  function go(next: number) {
    const len = slides.length;
    setIndex(((next % len) + len) % len);
  }

  return (
    <div className={`overflow-hidden rounded-[28px] bg-[#1c1636] ${className}`}>
      <div className="relative">
        <img
          src={current.url}
          alt={current.alt || title}
          className="aspect-[16/9] h-auto w-full object-cover"
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
                <img src={slide.url} alt="" className="h-14 w-20 object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
