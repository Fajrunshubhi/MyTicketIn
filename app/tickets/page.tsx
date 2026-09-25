"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { RouteLoading } from "@/components/ui/AppLoading";
import { EventCoverImg } from "@/components/events/EventCoverImg";
import { Icon } from "@/components/ui/Icon";
import { formatCheckInBefore, formatDateTime } from "@/lib/format";

type TicketRow = {
  id: string;
  ticketNumber: string;
  status: string;
  issuedAt: string;
  event?: {
    id?: string;
    slug?: string;
    title?: string;
    category?: string;
    startsAt?: string;
    timezone?: string;
    venueName?: string;
    city?: string;
    imageUrl?: string;
  };
  ticketType?: { name?: string; seatLabel?: string };
};

const STATUS_LABEL: Record<string, string> = {
  UNUSED: "Siap dipakai",
  USED: "Sudah check-in",
  CANCELLED: "Dibatalkan",
};

const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Semua" },
  { value: "UNUSED", label: "Siap dipakai" },
  { value: "USED", label: "Sudah check-in" },
  { value: "CANCELLED", label: "Dibatalkan" },
];

function statusClass(status: string) {
  if (status === "UNUSED") return "bg-[#eee8ff] text-gold-800";
  if (status === "USED") return "bg-stone-100 text-ink/60";
  return "bg-stone-100 text-ink/55";
}

function dayParts(iso?: string, tz?: string) {
  if (!iso) return { day: "—", month: "" };
  try {
    const date = new Date(iso);
    const day = new Intl.DateTimeFormat("id-ID", { day: "2-digit", timeZone: tz || "Asia/Jakarta" }).format(date);
    const month = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: tz || "Asia/Jakarta" }).format(date);
    return { day, month };
  } catch {
    return { day: "—", month: "" };
  }
}

export default function TicketsRoute() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <TicketsPage />
    </Suspense>
  );
}

function TicketsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const status = (params.get("status") || "").toUpperCase();
  const [items, setItems] = useState<TicketRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { data?: { access?: { canBuy?: boolean } } };
        if (body.data?.access?.canBuy === false) router.replace("/dashboard");
      })
      .catch(() => undefined);
  }, [router]);

  useEffect(() => {
    setLoading(true);
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    fetch(`/api/tickets${q}`, { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) {
          setError(body.error?.message || "Wallet tiket gagal dimuat.");
          setItems([]);
          return;
        }
        setError("");
        setItems((body.data as { items?: TicketRow[] })?.items || []);
      })
      .catch(() => setError("Wallet tiket gagal dimuat."))
      .finally(() => setLoading(false));
  }, [status]);

  const groups = useMemo(() => {
    const map = new Map<string, { event: TicketRow["event"]; tickets: TicketRow[] }>();
    const sorted = [...items].sort((a, b) => (a.event?.startsAt || "").localeCompare(b.event?.startsAt || ""));
    for (const t of sorted) {
      const key = t.event?.id || t.event?.slug || t.id;
      const cur = map.get(key);
      if (cur) cur.tickets.push(t);
      else map.set(key, { event: t.event, tickets: [t] });
    }
    return [...map.values()];
  }, [items]);

  return (
    <div>
      <p className="text-sm text-ink/65">Tiket digital milik akun Anda. Tunjukkan QR hanya kepada petugas check-in.</p>

      <nav aria-label="Filter status tiket" className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const on = status === f.value;
          return (
            <Link
              key={f.value || "all"}
              href={f.value ? `/tickets?status=${f.value}` : "/tickets"}
              className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium ${
                on ? "bg-gold-500 text-white" : "border border-stone-200 bg-white text-ink/75 hover:bg-stone-50"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {error ? (
        <div className="mt-4">
          <Alert tone="error" title={error} />
        </div>
      ) : null}
      {loading ? <p className="mt-8 text-sm text-ink/55">Memuat tiket…</p> : null}
      {!loading && groups.length === 0 && !error ? (
        <div className="mt-8 rounded-3xl border border-dashed border-stone-200 bg-white p-8 text-center">
          <p className="font-semibold text-ink">Belum ada tiket{status ? " dengan filter ini" : ""}.</p>
          <p className="mt-1 text-sm text-ink/60">Tiket muncul di sini setelah pembayaran order lunas.</p>
          <Link
            href="/dashboard/events"
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-gold-500 px-4 text-sm font-semibold text-white"
          >
            Lihat event
          </Link>
        </div>
      ) : null}

      <ul className="mt-6 space-y-6">
        {groups.map((group) => {
          const ev = group.event;
          const stamp = dayParts(ev?.startsAt, ev?.timezone);
          let when = "";
          try {
            when = ev?.startsAt ? formatDateTime(ev.startsAt, ev.timezone || "Asia/Jakarta") : "";
          } catch {
            when = "";
          }
          let checkIn = "";
          try {
            checkIn = ev?.startsAt ? formatCheckInBefore(ev.startsAt, ev.timezone || "Asia/Jakarta") : "";
          } catch {
            checkIn = "";
          }
          const place = [ev?.venueName, ev?.city].filter(Boolean).join(" · ");
          return (
            <li key={ev?.id || ev?.slug || group.tickets[0]?.id} className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr]">
                <EventCoverImg
                  src={ev?.imageUrl}
                  alt={ev?.title || "Event"}
                  category={ev?.category || ""}
                  title={ev?.title || ""}
                  seed={ev?.slug || ""}
                  width={640}
                  height={480}
                  className="aspect-[16/9] h-auto w-full bg-stone-200 object-cover object-center md:aspect-auto md:h-full md:min-h-[18rem]"
                />
                <div className="min-w-0">
                  <div className="flex gap-3 border-b border-stone-100 p-4 sm:gap-4 sm:p-5">
                    <div className="flex h-16 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-[#eee8ff] text-gold-800 sm:h-[4.5rem] sm:w-14">
                      <span className="text-base font-semibold leading-none sm:text-lg">{stamp.day}</span>
                      <span className="mt-1 text-[10px] font-medium uppercase sm:text-[11px]">{stamp.month}</span>
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-ink sm:text-lg">{ev?.title || "Event"}</h2>
                      {when ? (
                        <p className="mt-1 flex items-start gap-2 text-sm text-ink/65">
                          <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
                          <span>{when}</span>
                        </p>
                      ) : null}
                      {place ? (
                        <p className="mt-1 flex items-start gap-2 text-sm text-ink/55">
                          <Icon name="pin" className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
                          <span>{place}</span>
                        </p>
                      ) : null}
                      {checkIn ? <p className="mt-1 text-xs text-ink/50">{checkIn}</p> : null}
                    </div>
                  </div>
                  <ul className="divide-y divide-stone-100">
                    {group.tickets.map((t) => (
                      <li
                        key={t.id}
                        className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-ink">
                            {t.ticketType?.name || "Tiket"}
                            {t.ticketType?.seatLabel ? ` · ${t.ticketType.seatLabel}` : ""}
                          </p>
                          <p className="mt-0.5 break-all text-xs text-ink/50">{t.ticketNumber}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(t.status)}`}>
                            {STATUS_LABEL[t.status] || t.status}
                          </span>
                          <Link
                            href={`/tickets/${t.id}`}
                            className={`inline-flex min-h-11 w-full items-center justify-center rounded-full px-4 text-sm font-semibold sm:w-auto ${
                              t.status === "UNUSED" ? "bg-gold-500 text-white" : "border border-stone-200 text-ink hover:bg-stone-50"
                            }`}
                          >
                            {t.status === "UNUSED" ? "Tampilkan QR" : "Lihat tiket"}
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
