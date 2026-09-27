"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/shared/AppHeader";
import { NotificationBell } from "@/components/NotificationBell";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { LoadingState } from "@/components/ui/LoadingState";
import { readApiError } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { eventLifecycle, formatDateTime, formatRupiah } from "@/lib/format";
import { SalesBreakdownCharts, type SalesBar } from "@/components/dashboard/SalesBreakdownCharts";

type Summary = {
  paidOrderCount: number;
  ticketsSold: number;
  grossSandboxRupiah: number;
  completedRefundRupiah: number;
  checkInCount: number;
  attendanceRate: number | null;
};

type EventRow = {
  id: string;
  title: string;
  status: string;
  startsAt?: string;
  endsAt?: string;
  timezone?: string;
  paidOrderCount: number;
  ticketsSold: number;
  grossSandboxRupiah: number;
  checkInCount: number;
};

type Dash = {
  summary: Summary;
  events: EventRow[];
  nextCursor: string;
  asOf: string;
  sandbox: boolean;
  charts?: {
    events?: SalesBar[];
    categories?: SalesBar[];
    ticketTypes?: SalesBar[];
  };
};

type Trend = {
  series: { startAt: string; paidOrders: number; ticketsSold: number; grossSandboxRupiah: number }[];
  timezone: string;
};

export default function OrganizerDashboardClient({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const eventId = sp.get("eventId") || "";
  const [data, setData] = useState<Dash | null>(null);
  const [trend, setTrend] = useState<Trend | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState("");

  function load() {
    setLoading(true);
    setError("");
    const qs = new URLSearchParams();
    if (eventId) qs.set("eventId", eventId);
    fetch(`/api/organizer/dashboard?${qs.toString()}`, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace("/login?callbackUrl=/dashboard/laporan");
          return;
        }
        if (res.status === 403) {
          router.replace("/dashboard");
          return;
        }
        if (!res.ok) {
          setError(readApiError(body, "Gagal memuat dashboard."));
          setLoading(false);
          return;
        }
        setData(body.data as Dash);
        setLive("Ringkasan dashboard diperbarui.");
        setLoading(false);
      })
      .catch(() => {
        setError("Tidak dapat terhubung ke layanan.");
        setLoading(false);
      });
    if (eventId) {
      const to = new Date();
      const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
      fetch(
        `/api/organizer/events/${encodeURIComponent(eventId)}/sales-trend?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&bucket=day`,
        { credentials: "include", cache: "no-store" },
      )
        .then(async (res) => {
          if (!res.ok) {
            setTrend(null);
            return;
          }
          const body = await res.json();
          setTrend(body.data as Trend);
        })
        .catch(() => setTrend(null));
    } else {
      setTrend(null);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const summary = data?.summary;
  const body = (
    <div>
      {!embedded ? <h1 className="font-display text-3xl text-ink">Dashboard penjualan</h1> : null}
      <p className={`${embedded ? "" : "mt-2"} text-ink/65`}>Ringkasan pesanan lunas, tiket terjual, dan check-in.</p>
      <form
        className="mt-6 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const next = String(fd.get("eventId") || "");
          router.push(next ? `/dashboard/laporan?eventId=${encodeURIComponent(next)}` : "/dashboard/laporan");
        }}
      >
        <label className="text-sm text-ink/80">
          Filter event
          <select name="eventId" defaultValue={eventId} className="mt-1 block min-h-11 rounded bg-white p-2">
            <option value="">Semua event saya</option>
            {(data?.events || []).map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.title}</option>
            ))}
          </select>
        </label>
        <Button type="submit">Terapkan</Button>
        <Button type="button" onClick={load}>Muat ulang</Button>
        {eventId ? (
          <a className="text-sm text-gold-700 underline" href={`/api/organizer/events/${encodeURIComponent(eventId)}/participants.csv`}>
            Unduh CSV peserta
          </a>
        ) : (
          <p className="text-sm text-ink/55">Pilih satu event untuk mengekspor CSV peserta/check-in.</p>
        )}
      </form>
      <p className="sr-only" aria-live="polite">{live}</p>
      {loading ? <div className="mt-6"><LoadingState /></div> : null}
      {error ? <div className="mt-6"><Alert tone="error" title={error} /></div> : null}
      {summary ? (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <li className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm text-ink/55">Pesanan lunas</h2>
            <p className="mt-2 text-3xl text-ink">{summary.paidOrderCount}</p>
          </li>
          <li className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm text-ink/55">Tiket terjual</h2>
            <p className="mt-2 text-3xl text-ink">{summary.ticketsSold}</p>
          </li>
          <li className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm text-ink/55">Pendapatan</h2>
            <p className="mt-2 text-2xl text-ink">{formatRupiah(summary.grossSandboxRupiah)}</p>
          </li>
          <li className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm text-ink/55">Check-in</h2>
            <p className="mt-2 text-3xl text-ink">{summary.checkInCount}</p>
            <p className="mt-1 text-xs text-ink/55">
              Refund completed {formatRupiah(summary.completedRefundRupiah)}
              {summary.attendanceRate == null ? " · rasio kehadiran tidak tersedia" : ` · kehadiran ${summary.attendanceRate.toFixed(1)}%`}
            </p>
          </li>
        </ul>
      ) : null}
      {data?.asOf ? <p className="mt-3 text-sm text-ink/45">Per {formatDateTime(data.asOf)}</p> : null}
      <div className="mt-8">
        <SalesBreakdownCharts
          events={data?.charts?.events}
          categories={data?.charts?.categories}
          ticketTypes={data?.charts?.ticketTypes}
        />
      </div>
      {trend && trend.series.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-display text-2xl text-ink">Tren penjualan</h2>
          <p className="mt-1 text-sm text-ink/60">Timezone {trend.timezone}. Tabel ekuivalen grafik opsional.</p>
          <table className="mt-4 w-full min-w-0 text-left text-sm text-ink/80" aria-label="Agregat harian penjualan">
            <thead>
              <tr>
                <th className="py-2">Periode</th>
                <th>Pesanan lunas</th>
                <th>Tiket</th>
                <th>Pendapatan</th>
              </tr>
            </thead>
            <tbody>
              {trend.series.map((row) => (
                <tr key={row.startAt} className="border-t border-stone-200">
                  <td className="py-2">{formatDateTime(row.startAt, trend.timezone)}</td>
                  <td>{row.paidOrders}</td>
                  <td>{row.ticketsSold}</td>
                  <td>{formatRupiah(row.grossSandboxRupiah)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      <section className="mt-6" aria-labelledby="daftar-event-laporan">
        <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="flex flex-col gap-1 border-b border-stone-100 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="daftar-event-laporan" className="text-lg font-semibold text-ink">
                Kinerja per event
              </h2>
              <p className="mt-1 text-sm text-ink/55">Pesanan lunas, tiket, pendapatan, dan check-in.</p>
            </div>
            {data?.events?.length ? (
              <p className="text-sm tabular-nums text-ink/45">{data.events.length} event</p>
            ) : null}
          </div>
          {!loading && data && data.events.length === 0 ? (
            <p className="px-5 py-10 text-sm text-ink/60">Belum ada event pada filter ini.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-xs font-medium uppercase tracking-wide text-ink/45">
                    <th className="px-5 py-3 font-medium">Event</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 text-right font-medium">Pesanan</th>
                    <th className="px-3 py-3 text-right font-medium">Tiket</th>
                    <th className="px-3 py-3 text-right font-medium">Pendapatan</th>
                    <th className="px-3 py-3 text-right font-medium">Check-in</th>
                    <th className="px-5 py-3 text-right font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.events || []).map((ev) => {
                    const attendance = ev.ticketsSold ? Math.round((ev.checkInCount / ev.ticketsSold) * 100) : null;
                    const muted = ev.ticketsSold === 0 && ev.paidOrderCount === 0;
                    const life = eventLifecycle(ev.status, ev.startsAt, ev.endsAt);
                    return (
                      <tr key={ev.id} className="border-b border-stone-50 last:border-0 hover:bg-stone-50/80">
                        <td className="px-5 py-4">
                          <Link href={`/dashboard/event/${ev.id}`} className={`font-medium hover:text-gold-700 ${muted ? "text-ink/70" : "text-ink"}`}>
                            {ev.title}
                          </Link>
                          {life.key === "ended" ? <p className="mt-1 text-xs text-ink/50">{life.hint}</p> : null}
                        </td>
                        <td className="px-3 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${life.badgeClass}`}>{life.label}</span>
                        </td>
                        <td className={`px-3 py-4 text-right tabular-nums ${muted ? "text-ink/40" : "text-ink/80"}`}>{ev.paidOrderCount}</td>
                        <td className={`px-3 py-4 text-right tabular-nums ${muted ? "text-ink/40" : "text-ink/80"}`}>{ev.ticketsSold}</td>
                        <td className={`px-3 py-4 text-right tabular-nums ${muted ? "text-ink/40" : "text-ink"}`}>
                          {formatRupiah(ev.grossSandboxRupiah)}
                        </td>
                        <td className="px-3 py-4 text-right tabular-nums text-ink/80">
                          {ev.checkInCount}
                          {attendance == null ? "" : <span className="ml-1 text-xs text-ink/40">{attendance}%</span>}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            <Link
                              href={`/dashboard/event/${ev.id}`}
                              className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-gold-700 hover:bg-gold-50"
                            >
                              Kelola
                            </Link>
                            <Link
                              href={`/dashboard/laporan?eventId=${encodeURIComponent(ev.id)}`}
                              aria-current={eventId === ev.id ? "page" : undefined}
                              className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium ${
                                eventId === ev.id ? "bg-ink text-white" : "text-ink/70 hover:bg-stone-100"
                              }`}
                            >
                              Fokus
                            </Link>
                            <a
                              href={`/api/organizer/events/${ev.id}/participants.csv`}
                              className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-ink/70 hover:bg-stone-100"
                            >
                              <Icon name="file" className="h-3.5 w-3.5" />
                              CSV
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );

  if (embedded) {
    return body;
  }

  return (
    <main id="main-content" className="auth-shell min-h-screen">
      <AppHeader
        homeHref="/dashboard"
        items={[{ href: "/dashboard/event", label: "Event saya" }]}
        trailing={<NotificationBell href="/dashboard/notifications" />}
      />
      <Container>{body}</Container>
    </main>
  );
}
