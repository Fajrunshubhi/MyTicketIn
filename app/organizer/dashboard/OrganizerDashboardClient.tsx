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
import { formatDateTime, formatRupiah } from "@/lib/format";
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
    <>
      <p className="mb-2 text-sm text-gold-800">SANDBOX / TRANSAKSI UJI · bukan settlement</p>
      {!embedded ? <h1 className="font-display text-3xl text-ink">Dashboard penjualan</h1> : null}
      <p className={`${embedded ? "" : "mt-2"} text-ink/65`}>Angka dihitung dari order Paid, tiket terbit, dan check-in. Bukan laba atau pencairan.</p>
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
            <h2 className="text-sm text-ink/55">Order Paid</h2>
            <p className="mt-2 text-3xl text-ink">{summary.paidOrderCount}</p>
          </li>
          <li className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm text-ink/55">Tiket terjual</h2>
            <p className="mt-2 text-3xl text-ink">{summary.ticketsSold}</p>
          </li>
          <li className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm text-ink/55">Bruto sandbox</h2>
            <p className="mt-2 text-2xl text-ink">{formatRupiah(summary.grossSandboxRupiah)}</p>
            <p className="mt-1 text-xs text-gold-800">Nilai bruto sandbox—bukan settlement</p>
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
          <table className="mt-4 w-full min-w-0 text-left text-sm text-ink/80">
            <caption className="sr-only">Agregat harian penjualan sandbox</caption>
            <thead>
              <tr>
                <th className="py-2">Periode</th>
                <th>Order Paid</th>
                <th>Tiket</th>
                <th>Bruto sandbox</th>
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
      <section className="mt-10">
        <h2 className="font-display text-2xl text-ink">Event</h2>
        {!loading && data && data.events.length === 0 ? (
          <p className="mt-3 text-ink/65">Belum ada event atau penjualan pada filter ini.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {(data?.events || []).map((ev) => (
              <li key={ev.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                <p className="font-semibold text-ink">{ev.title}</p>
                <p className="mt-1 text-sm text-ink/65">
                  {ev.status} · {ev.paidOrderCount} order Paid · {ev.ticketsSold} tiket · {formatRupiah(ev.grossSandboxRupiah)} · {ev.checkInCount} check-in
                </p>
                <p className="mt-2 flex flex-wrap gap-3 text-sm">
                  <Link className="text-gold-700 underline" href={`/dashboard/event/${ev.id}`}>Kelola</Link>
                  <Link className="text-gold-700 underline" href={`/dashboard/laporan?eventId=${ev.id}`}>Filter kartu</Link>
                  <a className="text-gold-700 underline" href={`/api/organizer/events/${ev.id}/participants.csv`}>CSV</a>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
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
