import { formatDateTime, formatRupiah } from "@/lib/format";
import { SALE_LABEL, type PublicEvent } from "@/components/events/catalog-types";

export function TicketTypeList({ types, timezone }: { types: PublicEvent["ticketTypes"]; timezone: string }) {
  if (types.length === 0) {
    return <p className="mt-2 text-ink/60">Belum ada jenis tiket.</p>;
  }
  return (
    <ul className="mt-4 grid gap-3">
      {types.map((t) => (
        <li key={t.id} className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="font-semibold text-ink">{t.name}</p>
          {t.description ? <p className="mt-1 text-sm text-ink/65">{t.description}</p> : null}
          <p className="mt-2 text-sm text-ink/80">
            {formatRupiah(t.priceRupiah)} · kuota {t.quota} · sisa {t.remaining} · {SALE_LABEL[t.saleStatus] || t.saleStatus}
          </p>
          <p className="mt-1 text-xs text-ink/50">
            {formatDateTime(t.saleStartsAt, timezone)} – {formatDateTime(t.saleEndsAt, timezone)}
          </p>
        </li>
      ))}
    </ul>
  );
}
