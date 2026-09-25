import Link from "next/link";
import { formatCheckInBefore, formatDateTime, formatRupiah } from "@/lib/format";
import { SALE_LABEL, type PublicEvent } from "@/components/events/catalog-types";
import { TicketTypeList } from "@/components/events/TicketTypeList";
import { TicketSelector } from "@/components/events/TicketSelector";
import { SimilarEvents } from "@/components/recommendations/SimilarEvents";
import { EventReviews } from "@/components/reviews/EventReviews";
import { EventRatingSummary } from "@/components/reviews/StarRating";
import { loadSessionUser } from "@/lib/session";
import { Icon } from "@/components/ui/Icon";
import { EventGallery } from "@/components/events/EventGallery";
import { EventLocationMap } from "@/components/events/EventLocationMap";

export async function EventDetail({ event }: { event: PublicEvent }) {
  const user = await loadSessionUser();
  const canPurchase = Boolean(!user || user.access?.canBuy);
  const rawPrice = event.ticketTypes[0]?.priceRupiah;
  const price =
    rawPrice == null
      ? "menyusul"
      : Number.isInteger(rawPrice) && rawPrice >= 0
        ? formatRupiah(rawPrice)
        : "menyusul";
  const images = event.images && event.images.length > 0 ? event.images : event.image ? [event.image] : [];
  const organizerHref = event.organizer?.id ? `/organizers/${event.organizer.id}` : null;

  return (
    <article className="space-y-10 pb-8">
      <EventGallery images={images} title={event.title} className="w-full" />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)] lg:gap-10">
        <div className="min-w-0 space-y-8">
          <header>
            <p className="text-sm font-medium uppercase tracking-wide text-gold-800">{event.category}</p>
            <h1 className="mt-1 text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">{event.title}</h1>
            <p className="mt-3 text-sm text-ink/70">
              {event.organizer?.name ? (
                organizerHref ? (
                  <>
                    <Link href={organizerHref} className="font-medium text-gold-800 hover:underline">
                      {event.organizer.name}
                    </Link>
                    {" · "}
                  </>
                ) : (
                  `${event.organizer.name} · `
                )
              ) : null}
              {event.venueName}, {event.city}
            </p>
            <EventRatingSummary className="mt-3" average={event.ratingAverage || 0} count={event.ratingCount || 0} />
          </header>

          <ul className="grid gap-3 sm:grid-cols-3">
            <li className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink/45">
                <Icon name="clock" className="h-4 w-4 text-gold-600" />
                Waktu
              </p>
              <p className="mt-2 text-sm font-medium text-ink">{formatDateTime(event.startsAt, event.timezone)}</p>
              <p className="mt-1 text-xs text-ink/60">sampai {formatDateTime(event.endsAt, event.timezone)}</p>
            </li>
            <li className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink/45">
                <Icon name="pin" className="h-4 w-4 text-gold-600" />
                Lokasi
              </p>
              <p className="mt-2 text-sm font-medium text-ink">{event.venueName}</p>
              <p className="mt-1 text-xs text-ink/60">
                {event.city}, {event.province}
              </p>
            </li>
            <li className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink/45">
                <Icon name="ticket" className="h-4 w-4 text-gold-600" />
                Check-in
              </p>
              <p className="mt-2 text-sm font-medium text-ink">{formatCheckInBefore(event.startsAt, event.timezone)}</p>
              <p className="mt-1 text-xs text-ink/60">Mulai {price}</p>
            </li>
          </ul>

          <section>
            <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
              <Icon name="file" className="h-5 w-5 text-gold-600" />
              Deskripsi
            </h2>
            <p className="mt-3 whitespace-pre-wrap leading-relaxed text-ink/80">{event.description}</p>
          </section>

          <section>
            <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
              <Icon name="file" className="h-5 w-5 text-gold-600" />
              Syarat
            </h2>
            <p className="mt-3 whitespace-pre-wrap leading-relaxed text-ink/80">{event.terms}</p>
          </section>

          {Array.isArray(event.tags) && event.tags.length > 0 ? (
            <section>
              <h2 className="text-xl font-semibold text-ink">Tag</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {event.tags.map((tag) => (
                  <li key={tag}>
                    <a
                      href={`/events?tag=${encodeURIComponent(tag)}`}
                      className="inline-flex min-h-11 items-center rounded-full border border-stone-200 bg-white px-4 text-sm text-ink/80"
                    >
                      {tag.split("-").join(" ")}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {event.seatMap ? (
            <figure>
              <img src={event.seatMap.url} alt={event.seatMap.altText} className="w-full rounded-2xl border border-stone-200" />
              <figcaption className="mt-2 text-sm text-ink/60">{event.seatMap.legend}</figcaption>
            </figure>
          ) : null}

          {event.seats && event.seats.length > 0 ? (
            <ul className="grid grid-cols-2 gap-2" aria-label="Daftar kursi">
              {event.seats.map((seat) => (
                <li key={seat.id} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-ink/80">
                  {seat.label} · {SALE_LABEL[seat.saleStatus] || seat.saleStatus}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Beli tiket</p>
            <p className="mt-2 text-2xl font-semibold text-ink">Mulai {price}</p>
            <p className="mt-2 text-sm text-ink/70">{formatDateTime(event.startsAt, event.timezone)}</p>
            <p className="text-sm text-ink/55">{formatCheckInBefore(event.startsAt, event.timezone)}</p>
            <div className="mt-4">
              {canPurchase ? (
                <TicketSelector event={event} />
              ) : (
                <>
                  <p className="rounded-xl border border-stone-200 bg-[#f7f8fd] px-3 py-2 text-sm text-ink/70">
                    {user?.access?.canOrganize
                      ? "Sebagai penyelenggara, Anda hanya dapat melihat detail jenis tiket. Pembelian tiket tidak tersedia."
                      : "Akun ini tidak dapat membeli tiket. Detail jenis tiket tetap dapat dilihat di bawah."}
                  </p>
                  <TicketTypeList types={event.ticketTypes} timezone={event.timezone} />
                </>
              )}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink/50">{event.availabilityDisclaimer}</p>
          </div>

          <section className="rounded-3xl border border-stone-200 bg-white p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Icon name="mail" className="h-4 w-4 text-gold-600" />
              Kontak penyelenggara
            </h2>
            <p className="mt-3 text-sm text-ink/80">{event.contactEmail}</p>
            {event.contactPhone ? <p className="text-sm text-ink/80">{event.contactPhone}</p> : null}
            {organizerHref ? (
              <Link href={organizerHref} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-gold-800 hover:underline">
                Lihat profil penyelenggara
              </Link>
            ) : null}
          </section>
        </aside>
      </div>

      <section className="w-full border-t border-stone-200 pt-10">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
          <Icon name="pin" className="h-5 w-5 text-gold-600" />
          Lokasi event
        </h2>
        <p className="mt-3 font-medium text-ink">{event.venueName}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink/70">
          {event.addressLine}
          <br />
          {event.city}, {event.province}
        </p>
        <div className="mt-4 w-full">
          <EventLocationMap
            venueName={event.venueName}
            addressLine={event.addressLine}
            city={event.city}
            province={event.province}
            latitude={event.latitude}
            longitude={event.longitude}
          />
        </div>
      </section>

      <EventReviews slug={event.slug} eventTitle={event.title} organizerName={event.organizer?.name || ""} />
      <SimilarEvents slug={event.slug} />
    </article>
  );
}
