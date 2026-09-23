"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SALE_LABEL, type PublicEvent } from "@/components/events/catalog-types";
import { Button } from "@/components/ui/Button";
import { formatRupiah } from "@/lib/format";

export function TicketSelector({ event }: { event: PublicEvent }) {
  const router = useRouter();
  const reserved = event.inventoryMode === "RESERVED_SEATING";
  const [qty, setQty] = useState<Record<string, number>>({});
  const [seats, setSeats] = useState<string[]>([]);
  const seatList = event.seats || [];

  const eligible = event.ticketTypes.filter((t) => t.saleStatus === "AVAILABLE" && t.stockLabel !== "SOLD_OUT");
  const selected = useMemo(() => {
    if (reserved) return seats.length > 0;
    return Object.values(qty).some((n) => n > 0);
  }, [qty, reserved, seats]);

  function toggleSeat(id: string, available: boolean) {
    if (!available) return;
    setSeats((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function continueCheckout() {
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
    router.push("/checkout");
  }

  return (
    <div className="mt-3 space-y-2">
      {!reserved
        ? event.ticketTypes.map((t) => {
            const max = Math.max(0, t.remaining);
            const disabled = t.saleStatus !== "AVAILABLE" || max < 1;
            return (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{t.name}</p>
                  <p className="text-xs leading-snug text-ink/70">
                    {formatRupiah(t.priceRupiah)} · {SALE_LABEL[t.saleStatus] || t.saleStatus}
                    <br />
                    Kuota {t.quota} · sisa {t.remaining}
                    {t.stockLabel === "LOW" ? " · terbatas" : null}
                    {t.stockLabel === "SOLD_OUT" ? " · habis" : null}
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
            );
          })
        : (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">Pilih kursi</legend>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Pilih kursi">
              {seatList.map((seat) => {
                const available = seat.saleStatus !== "UNAVAILABLE" && eligible.length > 0;
                const on = seats.includes(seat.id);
                return (
                  <li key={seat.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      disabled={!available}
                      onClick={() => toggleSeat(seat.id, available)}
                      className={`min-h-11 w-full rounded-lg border px-3 py-2 text-sm ${on ? "border-gold-400 bg-gold-500/20 text-ink" : "border-stone-200 text-ink/80"} disabled:opacity-40`}
                    >
                      {seat.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        )}
      <Button disabled={!selected} onClick={continueCheckout}>
        Lanjutkan checkout
      </Button>
    </div>
  );
}
