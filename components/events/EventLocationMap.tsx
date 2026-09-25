"use client";

import { useId, useState } from "react";
import { eventMapQuery, googleMapsEmbedUrl, googleMapsSearchUrl } from "@/lib/maps";
import { Icon } from "@/components/ui/Icon";

export function EventLocationMap({
  venueName,
  addressLine,
  city,
  province,
  latitude,
  longitude,
}: {
  venueName: string;
  addressLine: string;
  city: string;
  province: string;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const query = eventMapQuery({ venueName, addressLine, city, province, latitude, longitude });
  const embed = googleMapsEmbedUrl(query);
  const enlarge = googleMapsSearchUrl(query);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <iframe
          title={`Peta lokasi ${venueName}`}
          src={embed}
          className="h-80 w-full border-0 sm:h-96"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-sm font-medium text-ink"
          onClick={() => setOpen(true)}
        >
          Perbesar peta
        </button>
        <a
          href={enlarge}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#eee8ff] px-4 text-sm font-semibold text-gold-800"
        >
          <Icon name="pin" className="h-4 w-4" />
          Buka di Google Maps
        </a>
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1c1636]/60 p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-paper shadow-card">
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <h3 id={titleId} className="text-lg font-semibold text-ink">
                {venueName}
              </h3>
              <button type="button" className="min-h-11 rounded-full px-3 text-sm font-medium text-ink" onClick={() => setOpen(false)}>
                Tutup
              </button>
            </div>
            <iframe title={`Peta besar ${venueName}`} src={embed} className="min-h-[420px] w-full flex-1 border-0" />
            <p className="px-5 py-3 text-sm">
              <a className="font-semibold text-gold-800 underline-offset-2 hover:underline" href={enlarge} target="_blank" rel="noreferrer">
                Buka versi penuh di Google Maps
              </a>
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
