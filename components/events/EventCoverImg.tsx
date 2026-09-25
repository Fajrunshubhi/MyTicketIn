"use client";

import { DUMMY_EVENT_COVER, eventImageSrc } from "@/lib/event-cover";

export function EventCoverImg({
  src,
  alt,
  className,
  category = "",
  title = "",
  seed = "",
  width,
  height,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  category?: string;
  title?: string;
  seed?: string;
  width?: number;
  height?: number;
}) {
  const resolved = eventImageSrc(src, category, title, seed);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolved}
      alt={alt}
      width={width}
      height={height}
      className={className}
      onError={(event) => {
        const el = event.currentTarget;
        if (el.dataset.fallback === "1") return;
        el.dataset.fallback = "1";
        el.src = DUMMY_EVENT_COVER;
      }}
    />
  );
}
