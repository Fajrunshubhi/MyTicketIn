"use client";

import { useMemo, useState } from "react";
import { formatRupiah } from "@/lib/format";

export type SalesBar = {
  key: string;
  label: string;
  ticketsSold: number;
  grossSandboxRupiah: number;
};

type Mode = "events" | "categories" | "ticketTypes";
type Series = "both" | "tickets" | "revenue";

const MODES: { id: Mode; label: string }[] = [
  { id: "events", label: "Per event" },
  { id: "categories", label: "Per kategori" },
  { id: "ticketTypes", label: "Per jenis tiket" },
];

const SERIES: { id: Series; label: string }[] = [
  { id: "revenue", label: "Pendapatan" },
  { id: "tickets", label: "Tiket laku" },
  { id: "both", label: "Keduanya" },
];

function barWidth(value: number, max: number): number {
  return Math.max(value > 0 ? 4 : 0, Math.round((value / Math.max(max, 1)) * 100));
}

function HorizontalBars({ rows, series }: { rows: SalesBar[]; series: Series }) {
  const maxTickets = Math.max(...rows.map((r) => r.ticketsSold), 1);
  const maxGross = Math.max(...rows.map((r) => Number(r.grossSandboxRupiah)), 1);
  const showTickets = series !== "revenue";
  const showRevenue = series !== "tickets";

  return (
    <ul className="mt-4 space-y-4">
      {rows.map((row) => (
        <li key={row.key || row.label}>
          <p className="truncate text-sm font-medium text-ink">{row.label}</p>
          {showRevenue ? (
            <div className="mt-1.5">
              <div className="flex items-baseline justify-between gap-3 text-xs text-ink/55">
                <span>Pendapatan</span>
                <span className="tabular-nums text-ink/80">{formatRupiah(Number(row.grossSandboxRupiah))}</span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
                <div className="h-full rounded-full bg-[#d4a017]" style={{ width: `${barWidth(Number(row.grossSandboxRupiah), maxGross)}%` }} />
              </div>
            </div>
          ) : null}
          {showTickets ? (
            <div className={showRevenue ? "mt-2" : "mt-1.5"}>
              <div className="flex items-baseline justify-between gap-3 text-xs text-ink/55">
                <span>Tiket laku</span>
                <span className="tabular-nums text-ink/80">{row.ticketsSold} tiket</span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
                <div className="h-full rounded-full bg-[#6d4aff]" style={{ width: `${barWidth(row.ticketsSold, maxTickets)}%` }} />
              </div>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function SalesBreakdownCharts({
  events = [],
  categories = [],
  ticketTypes = [],
  hideTicketTypes = false,
}: {
  events?: SalesBar[];
  categories?: SalesBar[];
  ticketTypes?: SalesBar[];
  hideTicketTypes?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("events");
  const [series, setSeries] = useState<Series>("revenue");
  const modes = hideTicketTypes ? MODES.filter((m) => m.id !== "ticketTypes") : MODES;
  const activeMode = hideTicketTypes && mode === "ticketTypes" ? "events" : mode;
  const rows = useMemo(() => {
    const src = activeMode === "events" ? events : activeMode === "categories" ? categories : ticketTypes;
    return [...src]
      .filter((r) => r.ticketsSold > 0 || r.grossSandboxRupiah > 0)
      .sort((a, b) =>
        series === "tickets" ? b.ticketsSold - a.ticketsSold : Number(b.grossSandboxRupiah) - Number(a.grossSandboxRupiah),
      );
  }, [activeMode, series, events, categories, ticketTypes]);
  const maxGross = Math.max(...rows.map((r) => Number(r.grossSandboxRupiah)), 1);

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm" aria-labelledby="grafik-penjualan">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="grafik-penjualan" className="text-lg font-semibold text-ink">
            Perbandingan penjualan
          </h2>
          <p className="mt-1 text-sm text-ink/55">
            Bandingkan penjualan antar event atau kategori.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Kelompok grafik">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={activeMode === m.id}
              className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium ${
                activeMode === m.id ? "bg-gold-500 text-white" : "bg-stone-100 text-ink/70 hover:bg-stone-200"
              }`}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Metrik grafik">
        {SERIES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={series === s.id}
            className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm ${
              series === s.id ? "bg-ink text-white" : "border border-stone-200 text-ink/70 hover:bg-stone-50"
            }`}
            onClick={() => setSeries(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-ink/55">Belum ada penjualan pada tampilan ini.</p>
      ) : (
        <>
          <HorizontalBars rows={rows} series={series} />
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-0 text-left text-sm text-ink/80">
              <thead>
                <tr className="border-b border-stone-200">
                  <th className="py-2 font-medium">Nama</th>
                  <th className="py-2 font-medium">Tiket laku</th>
                  <th className="py-2 font-medium">Pendapatan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key || row.label} className="border-b border-stone-100">
                    <td className="py-2.5 pr-3">{row.label}</td>
                    <td className="py-2.5 tabular-nums">{row.ticketsSold}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="w-28 shrink-0 tabular-nums">{formatRupiah(Number(row.grossSandboxRupiah))}</span>
                        <span className="hidden h-1.5 min-w-[4rem] flex-1 overflow-hidden rounded-full bg-stone-100 sm:block" aria-hidden="true">
                          <span
                            className="block h-full rounded-full bg-[#d4a017]"
                            style={{ width: `${barWidth(Number(row.grossSandboxRupiah), maxGross)}%` }}
                          />
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
