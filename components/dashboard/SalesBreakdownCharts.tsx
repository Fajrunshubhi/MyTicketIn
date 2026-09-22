"use client";

import { useMemo, useRef, useState, type FocusEvent, type MouseEvent } from "react";
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
  { id: "both", label: "Tiket & pendapatan" },
  { id: "tickets", label: "Tiket laku" },
  { id: "revenue", label: "Pendapatan" },
];

function compactRupiah(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 1)} M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)} jt`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} rb`;
  return String(n);
}

function shortLabel(label: string): string {
  return label.length > 14 ? `${label.slice(0, 13)}…` : label;
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const n = value / exp;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * exp;
}

function ChartTooltip({
  x,
  y,
  width,
  title,
  lines,
}: {
  x: number;
  y: number;
  width: number;
  title: string;
  lines: string[];
}) {
  const left = Math.min(Math.max(x, 96), Math.max(96, width - 96));
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 min-w-[10.5rem] max-w-[16rem] rounded-xl bg-ink px-3 py-2 text-white shadow-lg"
      style={{ left, top: Math.max(y - 12, 8), transform: "translate(-50%, -100%)" }}
    >
      <p className="text-sm font-semibold">{title}</p>
      {lines.map((line) => (
        <p key={line} className="mt-0.5 text-xs text-white/80">
          {line}
        </p>
      ))}
    </div>
  );
}

function GroupedColumnChart({ rows, series }: { rows: SalesBar[]; series: Series }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null);
  const showTickets = series !== "revenue";
  const showRevenue = series !== "tickets";
  const maxSold = niceMax(Math.max(...rows.map((r) => r.ticketsSold), 0));
  const maxGross = niceMax(Math.max(...rows.map((r) => Number(r.grossSandboxRupiah)), 0));
  const W = 720;
  const H = 260;
  const padL = showTickets ? 44 : 16;
  const padR = showRevenue ? 52 : 16;
  const padT = 16;
  const padB = 44;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = rows.length;
  const slot = plotW / n;
  const barGap = 6;
  const barW = Math.min(28, Math.max(10, (slot - 16 - (showTickets && showRevenue ? barGap : 0)) / (showTickets && showRevenue ? 2 : 1)));
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const highlight = tip ? rows[tip.i] : null;

  function moveTip(event: MouseEvent<SVGRectElement> | FocusEvent<SVGRectElement>, i: number) {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const x = "clientX" in event ? event.clientX - box.left : box.width / 2;
    const y = "clientY" in event ? event.clientY - box.top : 48;
    setTip({ i, x, y });
  }

  return (
    <figure className="mt-4">
      <div ref={wrapRef} className="relative" onMouseLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-72 w-full" role="img" aria-label="Grafik kolom tiket terjual dan pendapatan sandbox">
          {ticks.map((t) => {
            const y = padT + plotH * (1 - t);
            return (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#e7e5e4" strokeWidth="1" />
                {showTickets ? (
                  <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#78716c">
                    {Math.round(maxSold * t)}
                  </text>
                ) : null}
                {showRevenue ? (
                  <text x={W - padR + 8} y={y + 4} textAnchor="start" fontSize="10" fill="#78716c">
                    {compactRupiah(Math.round(maxGross * t))}
                  </text>
                ) : null}
              </g>
            );
          })}
          <line x1={padL} x2={padL} y1={padT} y2={padT + plotH} stroke="#d6d3d1" />
          <line x1={W - padR} x2={W - padR} y1={padT} y2={padT + plotH} stroke="#d6d3d1" />
          <line x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} stroke="#a8a29e" />
          {rows.map((row, i) => {
            const cx = padL + slot * i + slot / 2;
            const soldH = (row.ticketsSold / maxSold) * plotH;
            const grossH = (Number(row.grossSandboxRupiah) / maxGross) * plotH;
            const pair = showTickets && showRevenue;
            const soldX = pair ? cx - barW - barGap / 2 : cx - barW / 2;
            const grossX = pair ? cx + barGap / 2 : cx - barW / 2;
            return (
              <g key={row.key || `${row.label}-${i}`}>
                {showTickets ? (
                  <rect
                    x={soldX}
                    y={padT + plotH - soldH}
                    width={barW}
                    height={Math.max(soldH, row.ticketsSold > 0 ? 2 : 0)}
                    rx="4"
                    fill={tip?.i === i ? "#5b3dff" : "#6d4aff"}
                  />
                ) : null}
                {showRevenue ? (
                  <rect
                    x={grossX}
                    y={padT + plotH - grossH}
                    width={barW}
                    height={Math.max(grossH, Number(row.grossSandboxRupiah) > 0 ? 2 : 0)}
                    rx="4"
                    fill={tip?.i === i ? "#c4920f" : "#d4a017"}
                  />
                ) : null}
                <rect
                  x={padL + slot * i}
                  y={padT}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  className="cursor-pointer"
                  tabIndex={0}
                  aria-label={`${row.label}: ${row.ticketsSold} tiket laku, ${formatRupiah(Number(row.grossSandboxRupiah))} pendapatan sandbox`}
                  onMouseEnter={(e) => moveTip(e, i)}
                  onMouseMove={(e) => moveTip(e, i)}
                  onFocus={(e) => moveTip(e, i)}
                  onBlur={() => setTip(null)}
                />
                <text x={cx} y={H - 18} textAnchor="middle" fontSize="11" fill="#44403c">
                  {shortLabel(row.label)}
                </text>
              </g>
            );
          })}
        </svg>
        {highlight && tip ? (
          <ChartTooltip
            x={tip.x}
            y={tip.y}
            width={wrapRef.current?.clientWidth || 720}
            title={highlight.label}
            lines={[`${highlight.ticketsSold} tiket laku`, formatRupiah(Number(highlight.grossSandboxRupiah))]}
          />
        ) : null}
        <p className="sr-only" aria-live="polite">
          {highlight ? `${highlight.label}: ${highlight.ticketsSold} tiket laku, ${formatRupiah(Number(highlight.grossSandboxRupiah))}` : ""}
        </p>
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink/55">
        <span>{showTickets ? "Sumbu kiri: tiket laku" : "Pendapatan sandbox (Rp)"}</span>
        <span>{showRevenue && showTickets ? "Sumbu kanan: pendapatan sandbox" : "Arahkan kursor ke kolom untuk melihat data"}</span>
      </figcaption>
    </figure>
  );
}

export function SalesBreakdownCharts({
  events = [],
  categories = [],
  ticketTypes = [],
}: {
  events?: SalesBar[];
  categories?: SalesBar[];
  ticketTypes?: SalesBar[];
}) {
  const [mode, setMode] = useState<Mode>("events");
  const [series, setSeries] = useState<Series>("both");
  const rows = useMemo(() => {
    const src = mode === "events" ? events : mode === "categories" ? categories : ticketTypes;
    return src.filter((r) => r.ticketsSold > 0 || r.grossSandboxRupiah > 0);
  }, [mode, events, categories, ticketTypes]);

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm" aria-labelledby="grafik-penjualan">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="grafik-penjualan" className="text-lg font-semibold text-ink">Grafik penjualan</h2>
          <p className="mt-1 text-sm text-ink/55">Kolom dari order Paid: tiket laku dan pendapatan bruto sandbox.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Kelompok grafik">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={mode === m.id}
              className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium ${
                mode === m.id ? "bg-gold-500 text-white" : "bg-stone-100 text-ink/70 hover:bg-stone-200"
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
      <p className="mt-4 flex flex-wrap gap-4 text-xs text-ink/55">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-6 rounded-sm bg-[#6d4aff]" aria-hidden="true" />
          Tiket laku
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-6 rounded-sm bg-[#d4a017]" aria-hidden="true" />
          Pendapatan sandbox
        </span>
      </p>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-ink/55">Belum ada penjualan Paid pada tampilan ini.</p>
      ) : (
        <>
          <GroupedColumnChart rows={rows} series={series} />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-0 text-left text-sm text-ink/80">
              <caption className="sr-only">Rincian penjualan Paid, ekuivalen grafik kolom</caption>
              <thead>
                <tr className="border-b border-stone-200">
                  <th className="py-2 font-medium">Nama</th>
                  <th className="py-2 font-medium">Tiket laku</th>
                  <th className="py-2 font-medium">Pendapatan sandbox</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key || row.label} className="border-b border-stone-100">
                    <td className="py-2">{row.label}</td>
                    <td className="py-2">{row.ticketsSold}</td>
                    <td className="py-2">{formatRupiah(Number(row.grossSandboxRupiah))}</td>
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
