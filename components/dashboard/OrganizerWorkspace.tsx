"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OrganizerEventCard } from "@/components/dashboard/OrganizerEventCard";
import { type EventRecord, type TicketTypeRecord } from "@/components/events/event-types";
import { type AccountProfile } from "@/lib/account";
import { formatDateTime, formatRelativeId, formatRupiah } from "@/lib/format";
import { SalesBreakdownCharts, type SalesBar } from "@/components/dashboard/SalesBreakdownCharts";

type DashEvent = {
  id: string;
  title: string;
  status: string;
  paidOrderCount: number;
  ticketsSold: number;
  grossSandboxRupiah: number;
  checkInCount: number;
};

type Dash = {
  summary: {
    paidOrderCount: number;
    ticketsSold: number;
    grossSandboxRupiah: number;
    completedRefundRupiah: number;
    checkInCount: number;
    attendanceRate: number | null;
  };
  events: DashEvent[];
  charts?: {
    events?: SalesBar[];
    categories?: SalesBar[];
    ticketTypes?: SalesBar[];
  };
};

type Notice = {
  id: string;
  title: string;
  body: string;
  actionPath: string | null;
  createdAt: string;
  readAt: string | null;
};

type EventDetail = {
  event: EventRecord;
  ticketTypes: TicketTypeRecord[];
};

type TrendPoint = { startAt: string; ticketsSold: number; grossSandboxRupiah: number };

const TYPE_THEMES = [
  { wrap: "bg-sky-50", code: "text-sky-600", bar: "bg-sky-500" },
  { wrap: "bg-amber-50", code: "text-amber-700", bar: "bg-amber-500" },
  { wrap: "bg-emerald-50", code: "text-emerald-700", bar: "bg-emerald-500" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function smoothLine(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function hourLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).formatToParts(d);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hh}.${mm}`;
}

function SalesChart({ series }: { series: TrendPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null);
  const w = 280;
  const h = 150;
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 28;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const max = Math.max(...series.map((p) => p.ticketsSold), 1);
  const points = series.map((p, i) => {
    const x = padL + (series.length <= 1 ? plotW / 2 : (i / (series.length - 1)) * plotW);
    const y = padT + plotH - (p.ticketsSold / max) * plotH;
    return { x, y };
  });
  const line = smoothLine(points);
  const area = points.length
    ? `${line} L ${points[points.length - 1].x} ${padT + plotH} L ${points[0].x} ${padT + plotH} Z`
    : "";
  const ticks = series.length <= 4
    ? series
    : [series[0], series[Math.floor(series.length / 3)], series[Math.floor((series.length * 2) / 3)], series[series.length - 1]];
  const hitW = series.length <= 1 ? plotW : plotW / Math.max(series.length - 1, 1);
  const highlight = tip ? series[tip.i] : null;

  return (
    <figure>
      {series.length === 0 ? (
        <p className="mt-8 text-sm text-ink/55">Belum ada penjualan Paid pada rentang ini.</p>
      ) : (
        <div ref={wrapRef} className="relative" onMouseLeave={() => setTip(null)}>
          <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-36 w-full" role="img" aria-label="Tren penjualan tiket">
            <defs>
              <linearGradient id="ticket-selling-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f0b429" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#f0b429" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#ticket-selling-fill)" />
            <path d={line} fill="none" stroke="#e8a317" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {tip ? (
              <line x1={points[tip.i].x} x2={points[tip.i].x} y1={padT} y2={padT + plotH} stroke="#f0b429" strokeDasharray="3 3" opacity="0.7" />
            ) : null}
            {points.map((p, i) => (
              <circle key={series[i].startAt} cx={p.x} cy={p.y} r={tip?.i === i ? 4 : 0} fill="#e8a317" />
            ))}
            {ticks.map((row) => {
              const i = series.indexOf(row);
              const x = points[i]?.x ?? padL;
              return (
                <text key={`tick-${row.startAt}`} x={x} y={h - 6} textAnchor="middle" fontSize="9" fill="#a8a29e">
                  {hourLabel(row.startAt)}
                </text>
              );
            })}
            {points.map((p, i) => (
              <rect
                key={`hit-${series[i].startAt}`}
                x={Math.max(padL, p.x - hitW / 2)}
                y={padT}
                width={hitW}
                height={plotH}
                fill="transparent"
                className="cursor-pointer"
                tabIndex={0}
                aria-label={`${formatDateTime(series[i].startAt)}: ${series[i].ticketsSold} tiket, ${formatRupiah(Number(series[i].grossSandboxRupiah))}`}
                onMouseEnter={(e) => {
                  const box = wrapRef.current?.getBoundingClientRect();
                  if (!box) return;
                  setTip({ i, x: e.clientX - box.left, y: e.clientY - box.top });
                }}
                onMouseMove={(e) => {
                  const box = wrapRef.current?.getBoundingClientRect();
                  if (!box) return;
                  setTip({ i, x: e.clientX - box.left, y: e.clientY - box.top });
                }}
                onFocus={() => {
                  const box = wrapRef.current?.getBoundingClientRect();
                  if (!box) return;
                  setTip({ i, x: box.width / 2, y: 36 });
                }}
                onBlur={() => setTip(null)}
              />
            ))}
          </svg>
          {highlight && tip ? (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-20 min-w-[9rem] rounded-xl bg-ink px-3 py-2 text-white shadow-lg"
              style={{
                left: Math.min(Math.max(tip.x, 72), (wrapRef.current?.clientWidth || 280) - 72),
                top: Math.max(tip.y - 10, 8),
                transform: "translate(-50%, -100%)",
              }}
            >
              <p className="text-xs text-white/70">{formatDateTime(highlight.startAt)}</p>
              <p className="mt-0.5 text-sm font-semibold">{highlight.ticketsSold} tiket laku</p>
              <p className="text-xs text-white/80">{formatRupiah(Number(highlight.grossSandboxRupiah))}</p>
            </div>
          ) : null}
        </div>
      )}
    </figure>
  );
}

export function OrganizerWorkspace({ me }: { me: AccountProfile }) {
  const router = useRouter();
  const sp = useSearchParams();
  const q = (sp.get("q") || "").trim();
  const [dash, setDash] = useState<Dash | null>(null);
  const [details, setDetails] = useState<EventDetail[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [trendEventId, setTrendEventId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [dashRes, listRes, noteRes] = await Promise.all([
          fetch("/api/organizer/dashboard", { credentials: "include", cache: "no-store" }),
          fetch("/api/organizer/events?limit=20", { credentials: "include", cache: "no-store" }),
          fetch("/api/me/notifications?filter=all&limit=8", { credentials: "include", cache: "no-store" }),
        ]);
        if (dashRes.status === 401 || listRes.status === 401) {
          router.replace("/login?callbackUrl=/dashboard");
          return;
        }
        if (dashRes.status === 403 || listRes.status === 403) {
          setError("Dashboard ini hanya untuk penyelenggara yang disetujui.");
          setLoading(false);
          return;
        }
        const dashBody = await dashRes.json().catch(() => ({}));
        const listBody = await listRes.json().catch(() => ({}));
        const noteBody = await noteRes.json().catch(() => ({}));
        if (!dashRes.ok) {
          setError("Gagal memuat ringkasan penjualan.");
          setLoading(false);
          return;
        }
        const nextDash = dashBody.data as Dash;
        const items = (listBody.data?.items || []) as { id: string }[];
        const detailRows = await Promise.all(
          items.slice(0, 12).map(async (row) => {
            const res = await fetch(`/api/organizer/events/${row.id}`, { credentials: "include", cache: "no-store" });
            if (!res.ok) return null;
            const body = await res.json();
            return body.data as EventDetail;
          }),
        );
        if (cancelled) return;
        const loaded = detailRows.filter((row): row is EventDetail => Boolean(row));
        setDash(nextDash);
        setDetails(loaded);
        setNotices((noteBody.data?.items || []) as Notice[]);
        const featured =
          [...(nextDash.events || [])].sort((a, b) => b.ticketsSold - a.ticketsSold)[0]?.id || loaded.find((d) => d.event.status === "PUBLISHED")?.event.id || "";
        setTrendEventId(featured);
        if (featured) {
          const to = new Date();
          const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
          const trendRes = await fetch(
            `/api/organizer/events/${encodeURIComponent(featured)}/sales-trend?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&bucket=day`,
            { credentials: "include", cache: "no-store" },
          );
          if (trendRes.ok) {
            const trendBody = await trendRes.json();
            if (!cancelled) setTrend((trendBody.data?.series || []) as TrendPoint[]);
          }
        }
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("Tidak dapat terhubung ke layanan.");
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const now = Date.now();
  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return details.filter((row) => {
      if (!needle) return true;
      const e = row.event;
      return [e.title, e.city, e.venueName, e.category].join(" ").toLowerCase().includes(needle);
    });
  }, [details, q]);

  const ongoing = filtered.filter((row) => {
    const start = new Date(row.event.startsAt).getTime();
    const end = new Date(row.event.endsAt).getTime();
    return row.event.status === "PUBLISHED" && start <= now && now <= end;
  });
  const upcoming = filtered
    .filter((row) => row.event.status === "PUBLISHED" && new Date(row.event.startsAt).getTime() > now)
    .sort((a, b) => new Date(a.event.startsAt).getTime() - new Date(b.event.startsAt).getTime());
  const drafts = filtered.filter((row) => row.event.status === "DRAFT" || row.event.status === "PENDING_REVIEW");

  const ticketCards = filtered
    .flatMap((row) => row.ticketTypes.map((ticket) => ({ event: row.event, ticket })))
    .slice(0, 6);

  return (
    <div>
      <p className="text-sm text-gold-800">SANDBOX / TRANSAKSI UJI · bukan settlement</p>
      <p className="sr-only">Masuk sebagai {me.name || me.username}</p>
      {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
      {loading ? <p role="status" className="mt-6 text-ink/60">Memuat dashboard penyelenggara…</p> : null}

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_18.5rem]">
            <div className="min-w-0 space-y-6">
              <SalesBreakdownCharts
                events={dash?.charts?.events}
                categories={dash?.charts?.categories}
                ticketTypes={dash?.charts?.ticketTypes}
              />
              <section aria-labelledby="kapasitas-tiket">
                <h2 id="kapasitas-tiket" className="text-lg font-semibold text-ink">Jenis tiket</h2>
                {ticketCards.length === 0 ? (
                  <p className="mt-4 rounded-3xl border border-dashed border-stone-200 bg-white px-5 py-8 text-sm text-ink/60">
                    Belum ada jenis tiket. Tambahkan tiket pada event, lalu kuota dan sisa akan tampil di sini.
                  </p>
                ) : (
                  <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {ticketCards.map(({ event, ticket }, i) => {
                      const theme = TYPE_THEMES[i % TYPE_THEMES.length];
                      const used = ticket.paidQuantity ?? Math.max(0, ticket.quota - (ticket.remaining ?? ticket.quota));
                      return (
                        <li key={ticket.id} className={`rounded-3xl ${theme.wrap} p-5`}>
                          <p className={`text-xs font-semibold uppercase tracking-wider ${theme.code}`}>{initials(ticket.name)}</p>
                          <p className="mt-2 font-semibold text-ink">{ticket.name}</p>
                          <p className="mt-1 text-sm text-ink/55">
                            Terjual <span className={`font-semibold ${theme.code}`}>{used}</span>/{ticket.quota} tiket
                          </p>
                          <p className="mt-1 text-xs text-ink/45">Sisa {ticket.remaining ?? Math.max(0, ticket.quota - used)} · {formatRupiah(ticket.priceRupiah)}</p>
                          <p className="mt-2 truncate text-xs text-ink/40">{event.title}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="rounded-3xl bg-white p-5 shadow-sm" aria-labelledby="berlangsung">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="berlangsung" className="text-lg font-semibold text-ink">Event berlangsung</h2>
                  <Link href="/dashboard/event" className="text-sm text-gold-700">Semua</Link>
                </div>
                {ongoing.length === 0 ? (
                  <p className="mt-6 text-sm text-ink/55">Tidak ada event terbit yang sedang berlangsung.</p>
                ) : (
                  <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {ongoing.slice(0, 4).map((row) => (
                      <li key={row.event.id}>
                        <OrganizerEventCard event={row.event} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="space-y-6">
              <section className="rounded-3xl bg-white p-5 shadow-sm" aria-labelledby="notif-panel">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="notif-panel" className="text-lg font-semibold text-ink">Notifikasi</h2>
                  <Link href="/dashboard/notifications" className="text-sm text-gold-700">Semua</Link>
                </div>
                {notices.length === 0 ? (
                  <p className="mt-6 text-sm text-ink/55">Belum ada notifikasi.</p>
                ) : (
                  <ul className="mt-4 space-y-4">
                    {notices.slice(0, 5).map((n) => (
                      <li key={n.id} className="flex gap-3">
                        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${n.readAt ? "bg-stone-300" : "bg-gold-500"}`} aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="text-sm text-ink">
                            <span className="font-semibold">{n.title}</span>
                            <span className="text-ink/70"> — {n.body}</span>
                          </p>
                          <p className="mt-1 text-xs text-ink/40">
                            {n.readAt ? "Sudah dibaca" : "Belum dibaca"} · {formatRelativeId(n.createdAt)}
                          </p>
                          {n.actionPath ? (
                            <Link href={n.actionPath} className="mt-1 inline-block text-xs font-medium text-gold-700">
                              Buka
                            </Link>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <section className="rounded-3xl bg-white p-5 shadow-sm" aria-labelledby="mendatang">
              <div className="flex items-center justify-between gap-3">
                <h2 id="mendatang" className="text-lg font-semibold text-ink">Event mendatang</h2>
                <Link href="/dashboard/event" className="text-sm text-gold-700">Semua</Link>
              </div>
              {upcoming.length === 0 && drafts.length === 0 ? (
                <p className="mt-6 text-sm text-ink/55">Belum ada event terbit yang akan datang.</p>
              ) : (
                <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {upcoming.slice(0, 4).map((row) => (
                    <li key={row.event.id}>
                      <OrganizerEventCard event={row.event} />
                    </li>
                  ))}
                  {upcoming.length === 0
                    ? drafts.slice(0, 4).map((row) => (
                        <li key={row.event.id}>
                          <OrganizerEventCard event={row.event} />
                        </li>
                      ))
                    : null}
                </ul>
              )}
            </section>

            <section className="rounded-3xl bg-white p-5 shadow-sm" aria-labelledby="jual-tiket">
              <div className="flex items-start justify-between gap-3">
                <h2 id="jual-tiket" className="text-base font-semibold text-ink">Penjualan tiket</h2>
                <span className="text-ink/30" aria-hidden="true">···</span>
              </div>
              <SalesChart series={trend} />
              <Link
                href={trendEventId ? `/dashboard/laporan?eventId=${encodeURIComponent(trendEventId)}` : "/dashboard/laporan"}
                className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-gold-700"
              >
                Selengkapnya
                <span aria-hidden="true" className="ml-1">›</span>
              </Link>
            </section>
          </div>
    </div>
  );
}
