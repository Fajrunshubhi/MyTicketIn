"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SALE_LABEL, type PublicEvent } from "@/components/events/catalog-types";
import { Button } from "@/components/ui/Button";
import { formatDateTime, formatRupiah } from "@/lib/format";

export function TicketSelector({ event }: { event: PublicEvent }) {
  const router = useRouter();
  const reserved = event.inventoryMode === "RESERVED_SEATING";
  const zoned = event.inventoryMode === "ZONED";
  const [qty, setQty] = useState<Record<string, number>>({});
  const [seats, setSeats] = useState<string[]>([]);
  const [activeSection, setActiveSection] = useState<string>("");
  const seatList = event.seats || [];
  const sections = event.sections || [];
  const typesById = useMemo(() => new Map(event.ticketTypes.map((t) => [t.id, t])), [event.ticketTypes]);

  const selected = useMemo(() => {
    if (reserved) return seats.length > 0;
    return Object.values(qty).some((n) => n > 0);
  }, [qty, reserved, seats]);

  function ticketForSection(sectionId: string) {
    const section = sections.find((s) => s.id === sectionId);
    return section ? typesById.get(section.ticketTypeId) : undefined;
  }

  function seatAvailable(seat: { id: string; sectionId: string; saleStatus: string }) {
    if (seat.saleStatus !== "AVAILABLE") return false;
    const ticket = ticketForSection(seat.sectionId);
    if (!ticket) return false;
    return ticket.saleStatus === "AVAILABLE" && ticket.remaining > 0 && ticket.stockLabel !== "SOLD_OUT";
  }

  function toggleSeat(id: string, available: boolean) {
    if (!available) return;
    setSeats((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= 5) return cur;
      return [...cur, id];
    });
  }

  function continueCheckout() {
    if (event.purchasable === false) return;
    const payload = {
      eventId: event.id,
      slug: event.slug,
      organizerProfileId: event.organizer?.id || "",
      inventoryMode: event.inventoryMode,
      items: reserved
        ? []
        : event.ticketTypes
            .map((t) => ({ ticketTypeId: t.id, quantity: qty[t.id] || 0 }))
            .filter((it) => it.quantity > 0),
      seatIds: reserved ? seats : [],
    };
    sessionStorage.setItem("mti_checkout", JSON.stringify(payload));
    router.push(`/events/${event.slug}/checkout`);
  }

  const seatsBySection = useMemo(() => {
    return sections.map((section) => {
      const ticket = typesById.get(section.ticketTypeId);
      const list = seatList.filter((s) => s.sectionId === section.id);
      const availableCount = list.filter((s) => {
        if (s.saleStatus !== "AVAILABLE" || !ticket) return false;
        return ticket.saleStatus === "AVAILABLE" && ticket.remaining > 0 && ticket.stockLabel !== "SOLD_OUT";
      }).length;
      return { ...section, seats: list, availableCount, ticket };
    });
  }, [seatList, sections, typesById]);

  const visibleSections = activeSection ? seatsBySection.filter((s) => s.id === activeSection) : seatsBySection;
  const selectedSeats = seats
    .map((id) => {
      const seat = seatList.find((s) => s.id === id);
      if (!seat) return null;
      const section = sections.find((s) => s.id === seat.sectionId);
      const ticket = ticketForSection(seat.sectionId);
      return { id, label: seat.label, zone: section?.name || "Zona", price: ticket?.priceRupiah ?? 0 };
    })
    .filter(Boolean) as { id: string; label: string; zone: string; price: number }[];

  return (
    <div className="space-y-3">
      {reserved ? (
        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-ink">Pilih kursi</legend>
          <p className="mb-3 text-xs text-ink/60">
            Pilih zona, lalu kursi yang masih tersedia. Maksimal 5 kursi. Hold 15 menit berlaku saat checkout.
          </p>
          <p className="mb-3 rounded-xl border border-dashed border-stone-200 bg-[#f7f8fd] px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink/45">
            Panggung / area pertunjukan
          </p>
          {seatsBySection.length > 1 ? (
            <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Zona kursi">
              <button
                type="button"
                className={`min-h-11 rounded-full border px-3 text-xs font-semibold ${
                  !activeSection ? "border-gold-400 bg-gold-50 text-ink" : "border-stone-200 bg-white text-ink/70"
                }`}
                onClick={() => setActiveSection("")}
              >
                Semua zona
              </button>
              {seatsBySection.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className={`min-h-11 rounded-full border px-3 text-xs font-semibold ${
                    activeSection === section.id ? "border-gold-400 bg-gold-50 text-ink" : "border-stone-200 bg-white text-ink/70"
                  }`}
                  onClick={() => setActiveSection(section.id)}
                >
                  {section.name}
                  <span className="ml-1 font-normal text-ink/50">({section.availableCount})</span>
                </button>
              ))}
            </div>
          ) : null}
          <ul className="mb-3 flex flex-wrap gap-2 text-[11px] text-ink/65" aria-label="Legenda kursi">
            <li className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-stone-300 bg-white" aria-hidden /> Tersedia
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-gold-400 bg-gold-500/20" aria-hidden /> Dipilih
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-stone-200 bg-stone-100" aria-hidden /> Tidak tersedia
            </li>
          </ul>
          {seatsBySection.length === 0 ? (
            <p className="text-sm text-ink/60">Penyelenggara belum mengatur kursi bernomor untuk event ini.</p>
          ) : (
            visibleSections.map((section) => (
              <div key={section.id} className="mb-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink/45">{section.name}</p>
                <p className="mb-2 text-xs text-ink/55">
                  {section.ticket ? `${formatRupiah(section.ticket.priceRupiah)} · ` : null}
                  {section.availableCount} dari {section.seats.length} kursi tersedia
                </p>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label={`Kursi ${section.name}`}>
                  {section.seats.map((seat) => {
                    const available = seatAvailable(seat);
                    const on = seats.includes(seat.id);
                    const label = available ? `${seat.label}, tersedia` : `${seat.label}, tidak tersedia`;
                    return (
                      <li key={seat.id}>
                        <button
                          type="button"
                          aria-pressed={on}
                          aria-label={label}
                          disabled={!available}
                          onClick={() => toggleSeat(seat.id, available)}
                          className={`min-h-11 w-full rounded-lg border px-2 py-2 text-sm ${
                            on
                              ? "border-gold-400 bg-gold-500/20 font-semibold text-ink"
                              : available
                                ? "border-stone-200 text-ink/80 hover:border-gold-300"
                                : "border-stone-200 bg-stone-100 text-ink/40"
                          } disabled:cursor-not-allowed`}
                        >
                          {seat.label}
                          <span className="mt-0.5 block text-[10px] font-normal">
                            {available ? "Tersedia" : "Habis"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
          {selectedSeats.length ? (
            <ul className="space-y-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-ink/80" aria-live="polite">
              {selectedSeats.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span>
                    {s.zone} · {s.label} · {formatRupiah(s.price)}
                  </span>
                  <button type="button" className="min-h-11 text-gold-800 underline-offset-2 hover:underline" onClick={() => toggleSeat(s.id, true)}>
                    Batalkan
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink/55">Belum ada kursi dipilih</p>
          )}
        </fieldset>
      ) : (
        <>
          {zoned ? (
            <p className="text-xs text-ink/60">
              Pilih zona. Anda duduk bebas di zona itu; kuota sisa adalah tiket yang masih dapat dibeli.
            </p>
          ) : null}
          {event.ticketTypes.map((t) => {
            const max = Math.max(0, t.remaining);
            const disabled = t.saleStatus !== "AVAILABLE" || max < 1;
            const zone = sections.find((s) => s.ticketTypeId === t.id);
            return (
              <div key={t.id} className="rounded-2xl border border-stone-200 bg-[#f7f8fd] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{zoned && zone ? zone.name : t.name}</p>
                    {zoned && zone ? <p className="mt-0.5 text-xs text-ink/55">{t.name}</p> : null}
                    {t.description ? <p className="mt-1 text-xs leading-snug text-ink/60">{t.description}</p> : null}
                    <p className="mt-1 text-sm font-medium text-ink">{formatRupiah(t.priceRupiah)}</p>
                    <p className="mt-1 text-xs leading-snug text-ink/65">
                      {max < 1
                        ? "Zona ini sudah penuh"
                        : `${SALE_LABEL[t.saleStatus] || t.saleStatus} · sisa ${t.remaining} dari ${t.quota}`}
                      {t.stockLabel === "LOW" && max > 0 ? " · terbatas" : null}
                    </p>
                    <p className="mt-1 text-[11px] text-ink/45">
                      {formatDateTime(t.saleStartsAt, event.timezone)} – {formatDateTime(t.saleEndsAt, event.timezone)}
                    </p>
                  </div>
                  <label className="shrink-0 text-xs text-ink/80">
                    Jumlah
                    <input
                      type="number"
                      min={0}
                      max={max}
                      className="mt-1 block min-h-11 w-20 rounded-md border border-stone-300 bg-white px-2"
                      disabled={disabled}
                      value={qty[t.id] || 0}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        const next = Number.isFinite(n) ? Math.min(max, Math.max(0, Math.trunc(n))) : 0;
                        setQty((cur) => ({ ...cur, [t.id]: next }));
                      }}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </>
      )}
      <Button className="w-full" disabled={!selected || event.purchasable === false} onClick={continueCheckout}>
        {event.purchasable === false ? "Tiket tidak dijual" : "Lanjutkan checkout"}
      </Button>
    </div>
  );
}
