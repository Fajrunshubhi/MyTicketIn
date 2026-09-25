"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EventCoverImg } from "@/components/events/EventCoverImg";

type Item = {
  slug: string;
  title: string;
  category: string;
  city: string;
  province?: string;
  startsAt: string;
  timezone: string;
  organizer?: { name?: string };
  image?: { url?: string; altText?: string };
  reason?: string;
};

export function SimilarEvents({ slug }: { slug: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [mode, setMode] = useState("");

  useEffect(() => {
    fetch(`/api/events/${encodeURIComponent(slug)}/recommendations?limit=6`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          setItems([]);
          return;
        }
        const body = await res.json();
        setItems((body.data?.items || []) as Item[]);
        setMode(body.data?.mode || "");
      })
      .catch(() => setItems([]));
  }, [slug]);

  if (!items || items.length === 0) {
    return null;
  }

  return (
      <section className="mt-12" aria-labelledby="similar-heading">
      <h2 id="similar-heading" className="text-2xl font-semibold text-ink">Event lain yang mungkin Anda suka</h2>
      <p className="mt-1 text-sm text-ink/55">
        {mode === "HISTORY" ? "Berdasarkan pembelian Paid Anda." : "Berdasarkan kategori dan lokasi event ini."}
      </p>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.slug} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-card">
            <EventCoverImg
              src={item.image?.url}
              alt={item.image?.altText || item.title}
              category={item.category}
              title={item.title}
              seed={item.slug}
              className="h-32 w-full object-cover"
            />
            <div className="p-4">
            <p className="font-semibold text-ink">{item.title}</p>
            <p className="mt-1 text-sm text-ink/65">{item.organizer?.name ? `${item.organizer.name} · ` : null}{item.city}{item.province ? `, ${item.province}` : ""}</p>
            <p className="mt-1 text-sm text-gold-800">{item.reason}</p>
            <p className="mt-3">
              <Link className="text-gold-700 underline" href={`/events/${item.slug}`}>Lihat event</Link>
            </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
