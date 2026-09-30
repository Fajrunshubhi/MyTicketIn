"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OrganizerEventCard } from "@/components/dashboard/OrganizerEventCard";
import { type EventRecord, type TicketTypeRecord } from "@/components/events/event-types";
import { Icon, type IconName } from "@/components/ui/Icon";
import { type AccountProfile } from "@/lib/account";
import { formatDateTime, formatRelativeId, formatRupiah, eventHasEnded } from "@/lib/format";
import { SalesBreakdownCharts, type SalesBar } from "@/components/dashboard/SalesBreakdownCharts";
import { NotificationHoverItem } from "@/components/notifications/NotificationHoverItem";

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
  asOf?: string;
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

function greetingId(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Jakarta" }).format(new Date()),
  );
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}

function ticketSoldCount(ticket: TicketTypeRecord): number {
  return ticket.paidQuantity ?? Math.max(0, ticket.quota - (ticket.remaining ?? ticket.quota));
}

function percent(part: number, whole: number): number | null {
  if (!whole || whole < 0) return null;
  return Math.round((part / whole) * 100);
}

function compactRupiah(n: number): string {
  if (n >= 1_000_000) return `Rp${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)} jt`;
  if (n >= 1_000) return `Rp${Math.round(n / 1_000)} rb`;
  return formatRupiah(n);
}

function TicketTypeSalesChart({ types }: { types: TicketTypeRecord[] }) {
  const [metric, setMetric] = useState<"tickets" | "revenue">("tickets");
  const rows = types.map((ticket) => {
    const ticketsSold = ticketSoldCount(ticket);
    return {
      id: ticket.id,
      name: ticket.name,
      ticketsSold,
      revenue: ticketsSold * ticket.priceRupiah,
    };
  });
  const hasSales = rows.some((row) => row.ticketsSold > 0);
  const max = Math.max(...rows.map((row) => (metric === "tickets" ? row.ticketsSold : row.revenue)), 1);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Penjualan jenis tiket</h3>
        <div className="flex gap-1" role="group" aria-label="Metrik grafik jenis tiket">
          {(
            [
              { id: "tickets" as const, label: "Tiket" },
              { id: "revenue" as const, label: "Pendapatan" },
            ]
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={metric === opt.id}
              className={`inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-medium ${
                metric === opt.id ? "bg-ink text-white" : "border border-stone-200 text-ink/70 hover:bg-stone-50"
              }`}
              onClick={() => setMetric(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-xs text-ink/50">Kolom vertikal untuk event yang dipilih.</p>
      {!hasSales ? (
        <p className="mt-6 text-sm text-ink/55">Belum ada penjualan lunas pada event ini.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <ul className="flex h-56 min-w-0 items-end justify-center gap-3 px-1" role="img" aria-label="Grafik kolom penjualan jenis tiket">
            {rows.map((row) => {
              const value = metric === "tickets" ? row.ticketsSold : row.revenue;
              const height = Math.max(value > 0 ? 8 : 0, Math.round((value / max) * 100));
              const valueLabel = metric === "tickets" ? String(row.ticketsSold) : compactRupiah(row.revenue);
              return (
                <li key={row.id} className="flex h-full min-w-[3.25rem] max-w-[5.5rem] flex-1 flex-col items-center justify-end">
                  <p className="mb-1 text-[11px] tabular-nums text-ink/70">{valueLabel}</p>
                  <div className="flex h-[11.5rem] w-full items-end justify-center">
                    <div
                      className="w-[70%] max-w-[2.75rem] rounded-t-lg bg-[#6d4aff]"
                      style={{ height: `${height}%` }}
                      title={`${row.name}: ${metric === "tickets" ? `${row.ticketsSold} tiket` : formatRupiah(row.revenue)}`}
                      aria-label={`${row.name}: ${metric === "tickets" ? `${row.ticketsSold} tiket` : formatRupiah(row.revenue)}`}
                    />
                  </div>
                  <p className="mt-2 w-full truncate text-center text-xs font-medium text-ink" title={row.name}>
                    {row.name}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(d);
}

function KpiCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: IconName;
}) {
  return (
    <li className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-ink/55">{label}</p>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-gold-50 text-gold-700">
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 font-display text-2xl tabular-nums text-ink sm:text-3xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink/45">{hint}</p> : null}
    </li>
  );
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

function SalesChart({ series }: { series: TrendPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null);
  const w = 720;
  const h = 240;
  const padL = 36;
  const padR = 12;
  const padT = 16;
  const padB = 32;
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
  const ticks =
    series.length <= 6
      ? series
      : [series[0], series[Math.floor(series.length / 3)], series[Math.floor((series.length * 2) / 3)], series[series.length - 1]];
  const yTicks = [0, 0.5, 1];
  const hitW = series.length <= 1 ? plotW : plotW / Math.max(series.length - 1, 1);
  const highlight = tip ? series[tip.i] : null;

  return (
    <figure>
      {series.length === 0 ? (
        <p className="mt-8 text-sm text-ink/55">Belum ada penjualan pada 30 hari terakhir.</p>
      ) : (
        <div ref={wrapRef} className="relative" onMouseLeave={() => setTip(null)}>
          <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-56 w-full sm:h-64" role="img" aria-label="Tren tiket laku 30 hari">
            <defs>
              <linearGradient id="ticket-selling-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6d4aff" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#6d4aff" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {yTicks.map((t) => {
              const y = padT + plotH * (1 - t);
              return (
                <g key={t}>
                  <line x1={padL} x2={w - padR} y1={y} y2={y} stroke="#f5f5f4" strokeWidth="1" />
                  <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#a8a29e">
                    {Math.round(max * t)}
                  </text>
                </g>
              );
            })}
            <path d={area} fill="url(#ticket-selling-fill)" />
            <path d={line} fill="none" stroke="#6d4aff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {tip ? (
              <line x1={points[tip.i].x} x2={points[tip.i].x} y1={padT} y2={padT + plotH} stroke="#6d4aff" strokeDasharray="3 3" opacity="0.45" />
            ) : null}
            {points.map((p, i) => (
              <circle key={series[i].startAt} cx={p.x} cy={p.y} r={tip?.i === i ? 4.5 : 0} fill="#6d4aff" />
            ))}
            {ticks.map((row) => {
              const i = series.indexOf(row);
              const x = points[i]?.x ?? padL;
              return (
                <text key={`tick-${row.startAt}`} x={x} y={h - 8} textAnchor="middle" fontSize="11" fill="#78716c">
                  {dayLabel(row.startAt)}
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
                left: Math.min(Math.max(tip.x, 72), (wrapRef.current?.clientWidth || 720) - 72),
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
  const [capacityEventId, setCapacityEventId] = useState("");
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
          setError("Dashboard ini hanya untuk penyelenggara.");
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
  const ended = filtered
    .filter((row) => {
      const publishedOrDone = row.event.status === "PUBLISHED" || row.event.status === "COMPLETED";
      return publishedOrDone && eventHasEnded(row.event.endsAt, row.event.startsAt, now);
    })
    .sort((a, b) => new Date(b.event.endsAt).getTime() - new Date(a.event.endsAt).getTime());
  const drafts = filtered.filter((row) => row.event.status === "DRAFT" || row.event.status === "PENDING_REVIEW");

  const capacityChoices = useMemo(() => {
    const seen = new Set<string>();
    const rows: EventDetail[] = [];
    for (const row of [...ongoing, ...upcoming, ...ended, ...drafts, ...filtered]) {
      if (!row.ticketTypes.length || seen.has(row.event.id)) continue;
      seen.add(row.event.id);
      rows.push(row);
    }
    return rows;
  }, [ongoing, upcoming, ended, drafts, filtered]);
  const capacityRow =
    capacityChoices.find((row) => row.event.id === capacityEventId) || capacityChoices[0] || null;
  const capacityTypes = capacityRow
    ? [...capacityRow.ticketTypes].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "id"))
    : [];

  const featuredTitle = dash?.events.find((e) => e.id === trendEventId)?.title;
  const summary = dash?.summary;
  const attendancePct =
    summary?.attendanceRate == null ? null : Math.round(summary.attendanceRate * 100);
  const displayName = me.name?.trim() || me.username;

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl text-ink sm:text-3xl">
            {greetingId()}, {displayName}
          </h2>
          <p className="mt-1 text-sm text-ink/55">
            Ringkasan penjualan dan kehadiran event Anda.
            {dash?.asOf ? ` Per ${formatDateTime(dash.asOf)}.` : ""}
          </p>
        </div>
        <Link
          href="/dashboard/laporan"
          className="inline-flex min-h-11 items-center text-sm font-medium text-gold-700"
        >
          Laporan lengkap
          <span aria-hidden="true" className="ml-1">›</span>
        </Link>
      </div>
      <p className="sr-only">Masuk sebagai {displayName}</p>
      {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
      {loading ? <p role="status" className="mt-6 text-ink/60">Memuat dashboard penyelenggara…</p> : null}

      {summary && !loading ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            label="Pesanan lunas"
            value={String(summary.paidOrderCount)}
            hint="Pesanan yang sudah dibayar"
            icon="orders"
          />
          <KpiCard
            label="Tiket terjual"
            value={String(summary.ticketsSold)}
            hint="Tiket yang sudah terbit"
            icon="ticket"
          />
          <KpiCard
            label="Pendapatan"
            value={formatRupiah(summary.grossSandboxRupiah)}
            hint="Total penjualan kotor"
            icon="chart"
          />
          <KpiCard
            label="Check-in"
            value={String(summary.checkInCount)}
            hint={attendancePct == null ? "Rasio kehadiran belum tersedia" : `Kehadiran ${attendancePct}% dari tiket terjual`}
            icon="success"
          />
          <KpiCard
            label="Refund selesai"
            value={formatRupiah(summary.completedRefundRupiah)}
            icon="file"
          />
        </ul>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 rounded-3xl bg-white p-5 shadow-sm" aria-labelledby="tren-penjualan">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 id="tren-penjualan" className="text-lg font-semibold text-ink">Tren 30 hari</h2>
              <p className="mt-1 text-sm text-ink/55">
                Tiket laku per hari
                {featuredTitle ? ` · ${featuredTitle}` : ""} (zona Asia/Jakarta).
              </p>
            </div>
            <Link
              href={trendEventId ? `/dashboard/laporan?eventId=${encodeURIComponent(trendEventId)}` : "/dashboard/laporan"}
              className="inline-flex min-h-11 items-center text-sm font-medium text-gold-700"
            >
              Filter event
              <span aria-hidden="true" className="ml-1">›</span>
            </Link>
          </div>
          <SalesChart series={trend} />
        </section>

        <div className="space-y-6">
          <section className="rounded-3xl bg-white p-5 shadow-sm" aria-labelledby="perlu-tindak">
            <h2 id="perlu-tindak" className="text-lg font-semibold text-ink">Perlu tindak lanjut</h2>
            {drafts.length === 0 ? (
              <p className="mt-4 text-sm text-ink/55">Tidak ada draf atau event menunggu tinjauan.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {drafts.slice(0, 6).map((row) => (
                  <li key={row.event.id}>
                    <Link href={`/dashboard/event/${row.event.id}`} className="block rounded-2xl bg-stone-50 px-3 py-3 hover:bg-stone-100">
                      <p className="truncate text-sm font-medium text-ink">{row.event.title}</p>
                      <p className="mt-0.5 text-xs text-ink/50">
                        {row.event.status === "PENDING_REVIEW" ? "Menunggu tinjauan admin" : "Draf · belum diajukan"}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm" aria-labelledby="notif-panel">
            <div className="flex items-center justify-between gap-3">
              <h2 id="notif-panel" className="text-lg font-semibold text-ink">Notifikasi</h2>
              <Link href="/dashboard/notifications" className="text-sm text-gold-700">Semua</Link>
            </div>
            {notices.length === 0 ? (
              <p className="mt-6 text-sm text-ink/55">Belum ada notifikasi.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {notices.slice(0, 5).map((n) => (
                  <li key={n.id}>
                    <NotificationHoverItem item={n} fallbackHref="/dashboard/notifications" compact />
                    <p className="px-3 pb-1 text-xs text-ink/40">
                      {n.readAt ? "Sudah dibaca" : "Belum dibaca"} · {formatRelativeId(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div className="mt-6 space-y-6">
          <SalesBreakdownCharts
            events={dash?.charts?.events}
            categories={dash?.charts?.categories}
            hideTicketTypes
          />

          <section className="rounded-3xl bg-white p-5 shadow-sm" aria-labelledby="kapasitas-tiket">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="kapasitas-tiket" className="text-lg font-semibold text-ink">Kapasitas tiket</h2>
                <p className="mt-1 text-sm text-ink/55">Kuota dan penjualan jenis tiket untuk satu event.</p>
              </div>
              {capacityRow ? (
                <Link href={`/dashboard/event/${capacityRow.event.id}`} className="text-sm font-medium text-gold-700">
                  Kelola event ini
                </Link>
              ) : (
                <Link href="/dashboard/event" className="text-sm text-gold-700">Kelola event</Link>
              )}
            </div>
            {capacityChoices.length > 1 ? (
              <label className="mt-4 block text-sm text-ink/80">
                Pilih event
                <select
                  className="mt-1 block min-h-11 w-full max-w-lg rounded-xl border border-stone-200 bg-white px-3 text-sm text-ink"
                  value={capacityRow?.event.id || ""}
                  onChange={(e) => setCapacityEventId(e.target.value)}
                >
                  {capacityChoices.map((row) => (
                    <option key={row.event.id} value={row.event.id}>
                      {row.event.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {capacityTypes.length === 0 ? (
              <p className="mt-4 text-sm text-ink/60">Belum ada jenis tiket. Tambahkan tiket pada event, lalu kuota tampil di sini.</p>
            ) : (
              <div className="mt-4 grid gap-8 lg:grid-cols-2 lg:items-start">
                <div className="min-w-0 max-h-[22rem] overflow-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <caption className="sr-only">Kuota jenis tiket untuk {capacityRow?.event.title}</caption>
                  <thead>
                    <tr className="border-b border-stone-100 text-xs font-medium uppercase tracking-wide text-ink/45">
                      <th className="py-2 pr-3 font-medium">Jenis tiket</th>
                      <th className="py-2 pr-3 text-right font-medium">Terjual</th>
                      <th className="py-2 pr-3 text-right font-medium">Sisa</th>
                      <th className="py-2 pr-3 font-medium">Kuota</th>
                      <th className="py-2 text-right font-medium">Harga</th>
                    </tr>
                  </thead>
                  <tbody>
                    {capacityTypes.map((ticket) => {
                      const used = ticketSoldCount(ticket);
                      const remaining = ticket.remaining ?? Math.max(0, ticket.quota - used);
                      const soldPct = percent(used, ticket.quota) ?? 0;
                      return (
                        <tr key={ticket.id} className="border-b border-stone-50 last:border-0">
                          <td className="py-3 pr-3 font-medium text-ink">{ticket.name}</td>
                          <td className="py-3 pr-3 text-right tabular-nums text-ink/80">
                            {used}
                            <span className="ml-1 text-xs text-ink/40">{soldPct}%</span>
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums text-ink/70">{remaining}</td>
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-2">
                              <span className="w-8 shrink-0 tabular-nums text-ink/55">{ticket.quota}</span>
                              <span className="h-1.5 min-w-[4rem] flex-1 overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
                                <span className="block h-full rounded-full bg-gold-500" style={{ width: `${soldPct}%` }} />
                              </span>
                            </div>
                          </td>
                          <td className="py-3 text-right tabular-nums text-ink/80">{formatRupiah(ticket.priceRupiah)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
                <TicketTypeSalesChart types={capacityTypes} />
              </div>
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
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {ongoing.slice(0, 4).map((row) => (
                  <li key={row.event.id}>
                    <OrganizerEventCard event={row.event} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm" aria-labelledby="mendatang">
            <div className="flex items-center justify-between gap-3">
              <h2 id="mendatang" className="text-lg font-semibold text-ink">Event mendatang</h2>
              <Link href="/dashboard/event" className="text-sm text-gold-700">Semua</Link>
            </div>
            {upcoming.length === 0 && drafts.length === 0 ? (
              <p className="mt-6 text-sm text-ink/55">Belum ada event terbit yang akan datang.</p>
            ) : (
              <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {upcoming.slice(0, 6).map((row) => (
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
          <section className="rounded-3xl bg-white p-5 shadow-sm" aria-labelledby="selesai">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="selesai" className="text-lg font-semibold text-ink">Event selesai</h2>
                <p className="mt-1 text-sm text-ink/55">Jadwal sudah berakhir, termasuk yang status katalognya masih Terbit.</p>
              </div>
              <Link href="/dashboard/event" className="text-sm text-gold-700">Semua</Link>
            </div>
            {ended.length === 0 ? (
              <p className="mt-6 text-sm text-ink/55">Belum ada event yang jadwalnya berakhir.</p>
            ) : (
              <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {ended.slice(0, 6).map((row) => (
                  <li key={row.event.id}>
                    <OrganizerEventCard event={row.event} />
                  </li>
                ))}
              </ul>
            )}
          </section>
      </div>
    </div>
  );
}
