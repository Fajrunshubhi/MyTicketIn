import { formatDateTime, formatRupiah } from "@/lib/format";
import { SALE_LABEL, type PublicEvent } from "@/components/events/catalog-types";
import { TicketTypeList } from "@/components/events/TicketTypeList";
import { TicketSelector } from "@/components/events/TicketSelector";
import { SimilarEvents } from "@/components/recommendations/SimilarEvents";
import { loadSessionUser } from "@/lib/session";
import { Icon } from "@/components/ui/Icon";
import { EventGallery } from "@/components/events/EventGallery";
import { EventLocationMap } from "@/components/events/EventLocationMap";

export async function EventDetail({ event }: { event: PublicEvent }) {
  const user = await loadSessionUser();
  const canPurchase = Boolean(!user || user.access?.canBuy);
  const price = event.ticketTypes[0] ? formatRupiah(event.ticketTypes[0].priceRupiah) : "menyusul";
  const images = event.images && event.images.length > 0 ? event.images : [event.image];
  return (
    <article className="space-y-8">
      <EventGallery images={images} title={event.title} className="w-full" />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <header className="order-1">
          <p className="text-sm font-medium uppercase tracking-wide text-gold-800">{event.category}</p>
          <h1 className="mt-1 text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">{event.title}</h1>
          <p className="mt-3 text-sm text-ink/70">
            {event.organizer?.name ? `${event.organizer.name} · ` : null}
            {event.venueName}, {event.city}
          </p>
        </header>

        <aside className="order-2 rounded-3xl border border-stone-200 bg-paper p-5 shadow-card lg:sticky lg:top-6 lg:row-span-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Icon name="clock" className="h-4 w-4 text-gold-600" />
            Waktu
          </p>
          <p className="mt-2 text-sm text-ink/75">
            {formatDateTime(event.startsAt, event.timezone)}
            <br />
            sampai {formatDateTime(event.endsAt, event.timezone)}
          </p>
          <p className="mt-3 text-sm text-ink/60">Mulai {price}</p>
          <div className="mt-3">
            {canPurchase ? (
              <TicketSelector event={event} />
            ) : (
              <p className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-ink/70">
                {user?.access?.canOrganize
                  ? "Sebagai penyelenggara, Anda hanya dapat melihat detail jenis tiket. Pembelian tiket tidak tersedia."
                  : "Akun ini tidak dapat membeli tiket. Detail jenis tiket tetap dapat dilihat di bawah."}
              </p>
            )}
          </div>
          <p className="mt-3 text-xs text-ink/50">{event.availabilityDisclaimer}</p>
        </aside>

        <div className="order-3 space-y-8">
          <section>
            <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
              <Icon name="file" className="h-5 w-5 text-gold-600" />
              Deskripsi
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-ink/80">{event.description}</p>
          </section>
          {!canPurchase ? (
            <section>
              <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
                <Icon name="ticket" className="h-5 w-5 text-gold-600" />
                Tiket
              </h2>
              <TicketTypeList types={event.ticketTypes} timezone={event.timezone} />
            </section>
          ) : null}
          <section>
            <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
              <Icon name="file" className="h-5 w-5 text-gold-600" />
              Syarat
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-ink/80">{event.terms}</p>
          </section>
          <section>
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
            <div className="mt-4">
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
          {event.tags && event.tags.length > 0 ? (
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
          {event.seats.length > 0 ? (
            <ul className="grid grid-cols-2 gap-2" aria-label="Daftar kursi">
              {event.seats.map((seat) => (
                <li key={seat.id} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-ink/80">
                  {seat.label} · {SALE_LABEL[seat.saleStatus] || seat.saleStatus}
                </li>
              ))}
            </ul>
          ) : null}
          <section>
            <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
              <Icon name="mail" className="h-5 w-5 text-gold-600" />
              Kontak
            </h2>
            <p className="mt-2 text-ink/80">{event.contactEmail}</p>
            {event.contactPhone ? <p className="text-ink/80">{event.contactPhone}</p> : null}
          </section>
        </div>
      </div>
      <SimilarEvents slug={event.slug} />
    </article>
  );
}
