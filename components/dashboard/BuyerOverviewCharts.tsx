"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { formatDateTime, formatRupiah } from "@/lib/format";
import { compactRupiah, type BuyerEventSpend, type BuyerMonthSpend, type BuyerStatusSlice } from "@/lib/buyer-dashboard";

const STATUS_COLOR: Record<string, string> = {
  PAID: "#059669",
  PENDING: "#d97706",
  EXPIRED: "#78716c",
  FAILED: "#e11d48",
  CANCELLED: "#be123c",
  REFUNDED: "#7c3aed",
};

function smoothLine(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
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

function SpendTrend({ series }: { series: BuyerMonthSpend[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const gradId = useId();
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null);
  const w = 720;
  const h = 240;
  const padL = 52;
  const padR = 16;
  const padT = 18;
  const padB = 32;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const max = Math.max(...series.map((p) => p.spentRupiah), 1);
  const points = series.map((p, i) => {
    const x = padL + (series.length <= 1 ? plotW / 2 : (i / (series.length - 1)) * plotW);
    const y = padT + plotH - (p.spentRupiah / max) * plotH;
    return { x, y };
  });
  const line = smoothLine(points);
  const area = points.length
    ? `${line} L ${points[points.length - 1].x} ${padT + plotH} L ${points[0].x} ${padT + plotH} Z`
    : "";
  const hitW = series.length <= 1 ? plotW : plotW / Math.max(series.length - 1, 1);
  const highlight = tip ? series[tip.i] : null;
  const hasSpend = series.some((p) => p.spentRupiah > 0);

  function moveTip(i: number, clientX: number, clientY: number) {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ i, x: Math.min(Math.max(8, clientX - box.left), box.width - 8), y: clientY - box.top });
  }

  return (
    <figure>
      <figcaption className="sr-only">Pengeluaran order lunas per bulan selama enam bulan terakhir.</figcaption>
      {!hasSpend ? (
        <p className="mt-8 text-sm text-ink/55">Belum ada pengeluaran lunas pada 6 bulan terakhir.</p>
      ) : (
        <div ref={wrapRef} className="relative" onMouseLeave={() => setTip(null)}>
          <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-48 w-full sm:h-56 md:h-64" role="img" aria-label="Tren pengeluaran 6 bulan">
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6d4aff" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#6d4aff" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {[0, 0.5, 1].map((t) => {
              const y = padT + plotH * (1 - t);
              return (
                <g key={t}>
                  <line x1={padL} x2={w - padR} y1={y} y2={y} stroke="#f5f5f4" strokeWidth="1" />
                  <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#a8a29e">
                    {compactRupiah(Math.round(max * t))}
                  </text>
                </g>
              );
            })}
            <path d={area} fill={`url(#${gradId})`} />
            <path d={line} fill="none" stroke="#6d4aff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {tip ? (
              <line x1={points[tip.i].x} x2={points[tip.i].x} y1={padT} y2={padT + plotH} stroke="#6d4aff" strokeDasharray="3 3" opacity="0.45" />
            ) : null}
            {points.map((p, i) => (
              <circle key={series[i].key} cx={p.x} cy={p.y} r={tip?.i === i ? 4.5 : 3} fill="#6d4aff" />
            ))}
            {series.map((row, i) => (
              <text key={`tick-${row.key}`} x={points[i].x} y={h - 8} textAnchor="middle" fontSize="11" fill="#78716c">
                {row.label}
              </text>
            ))}
            {points.map((p, i) => (
              <rect
                key={`hit-${series[i].key}`}
                x={Math.max(padL, p.x - hitW / 2)}
                y={padT}
                width={hitW}
                height={plotH}
                fill="transparent"
                className="cursor-pointer"
                tabIndex={0}
                aria-label={`${series[i].label}: ${formatRupiah(series[i].spentRupiah)}, ${series[i].orders} order`}
                onMouseEnter={(e) => moveTip(i, e.clientX, e.clientY)}
                onMouseMove={(e) => moveTip(i, e.clientX, e.clientY)}
                onClick={(e) => moveTip(i, e.clientX, e.clientY)}
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
              className="pointer-events-none absolute z-20 min-w-[9rem] -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-white shadow-lg"
              style={{ left: tip.x, top: Math.max(8, tip.y - 72) }}
            >
              <p className="text-xs text-white/70">{highlight.label}</p>
              <p className="text-sm font-semibold tabular-nums">{formatRupiah(highlight.spentRupiah)}</p>
              <p className="text-xs text-white/70">{highlight.orders} order lunas</p>
            </div>
          ) : null}
        </div>
      )}
    </figure>
  );
}

function StatusDonut({ slices }: { slices: BuyerStatusSlice[] }) {
  const total = slices.reduce((sum, s) => sum + s.count, 0);
  const r = 54;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0 sm:h-40 sm:w-40" role="img" aria-label="Komposisi status order">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#f5f5f4" strokeWidth="16" />
        {total === 0 ? null : slices.map((slice) => {
          const len = (slice.count / total) * c;
          const dash = `${len} ${c - len}`;
          const el = (
            <circle
              key={slice.status}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={STATUS_COLOR[slice.status] || "#6d4aff"}
              strokeWidth="16"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform="rotate(-90 70 70)"
            />
          );
          offset += len;
          return el;
        })}
        <text x="70" y="66" textAnchor="middle" fontSize="18" fontWeight="700" fill="#1c1636">
          {total}
        </text>
        <text x="70" y="84" textAnchor="middle" fontSize="10" fill="#78716c">
          order
        </text>
      </svg>
      <ul className="grid w-full grid-cols-1 gap-2">
        {slices.length === 0 ? (
          <li className="text-sm text-ink/55">Belum ada order.</li>
        ) : (
          slices.map((slice) => (
            <li key={slice.status} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: STATUS_COLOR[slice.status] || "#6d4aff" }}
                  aria-hidden="true"
                />
                <span className="truncate">{slice.label}</span>
              </span>
              <span className="tabular-nums text-ink/70">
                {slice.count}
                <span className="sr-only"> order</span>
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function EventSpendColumns({ rows }: { rows: BuyerEventSpend[] }) {
  const max = Math.max(...rows.map((r) => r.spentRupiah), 1);
  return (
    <div className="-mx-1 overflow-x-auto pb-1">
      <ul
        className="flex h-56 min-w-0 items-end justify-center gap-2 px-1 sm:gap-3"
        role="img"
        aria-label="Pengeluaran lunas per event, lima teratas dan sisanya digabung"
      >
        {rows.map((row) => {
          const height = Math.max(row.spentRupiah > 0 ? 8 : 0, Math.round((row.spentRupiah / max) * 100));
          const other = row.eventId === "lainnya";
          return (
            <li key={row.eventId} className="flex h-full w-[4.5rem] min-w-[4.5rem] flex-1 flex-col items-center justify-end sm:w-[5.5rem] sm:min-w-[5.5rem] sm:max-w-[7rem]">
              <p className="mb-1 text-[11px] tabular-nums text-ink/70">{compactRupiah(row.spentRupiah)}</p>
              <div className="flex h-[10.5rem] w-full items-end justify-center">
                <div
                  className={`w-[70%] max-w-[2.75rem] rounded-t-lg ${other ? "bg-stone-300" : "bg-[#6d4aff]"}`}
                  style={{ height: `${height}%` }}
                  title={`${row.title}: ${formatRupiah(row.spentRupiah)}, ${row.orders} order`}
                  aria-label={`${row.title}: ${formatRupiah(row.spentRupiah)}, ${row.orders} order`}
                />
              </div>
              <p className="mt-2 w-full truncate text-center text-xs font-medium text-ink" title={row.title}>
                {row.title}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export type BuyerDashboardData = {
  spentRupiah: number;
  refundedRupiah: number;
  paidOrderCount: number;
  pendingOrderCount: number;
  activeTicketCount: number;
  loyaltyPoints: number;
  nextTicket: {
    id: string;
    ticketNumber: string;
    title: string;
    startsAt: string;
    venue: string;
    slug: string;
  } | null;
  monthlySpend: BuyerMonthSpend[];
  orderStatus: BuyerStatusSlice[];
  eventSpend: BuyerEventSpend[];
};

export function BuyerOverviewCharts({ data }: { data: BuyerDashboardData }) {
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-12">
      <section className="rounded-3xl bg-white p-5 shadow-sm lg:col-span-7" aria-labelledby="buyer-spend-trend">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="buyer-spend-trend" className="text-lg font-semibold text-ink">
              Pengeluaran 6 bulan
            </h2>
            <p className="mt-1 text-sm text-ink/55">Order lunas per bulan. Bukan faktur pajak.</p>
          </div>
          <Link href="/dashboard/order?status=PAID" className="text-sm font-medium text-gold-700">
            Lihat order
          </Link>
        </div>
        <SpendTrend series={data.monthlySpend} />
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm lg:col-span-5" aria-labelledby="buyer-order-mix">
        <h2 id="buyer-order-mix" className="text-lg font-semibold text-ink">
          Status order
        </h2>
        <p className="mt-1 text-sm text-ink/55">Semua order akun ini, termasuk yang belum lunas.</p>
        <div className="mt-4">
          <StatusDonut slices={data.orderStatus} />
        </div>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm lg:col-span-12" aria-labelledby="buyer-event-spend">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="buyer-event-spend" className="text-lg font-semibold text-ink">
              Event dengan pengeluaran terbesar
            </h2>
            <p className="mt-1 text-sm text-ink/55">
              Lima event teratas. Event lain digabung sebagai Lainnya agar grafik tidak memanjang.
            </p>
          </div>
          <Link href="/dashboard/order?status=PAID" className="text-sm font-medium text-gold-700">
            Semua order
          </Link>
        </div>
        <div className="mt-4">
          {data.eventSpend.length === 0 ? (
            <p className="text-sm text-ink/55">Belum ada pembelian lunas untuk dibandingkan.</p>
          ) : (
            <EventSpendColumns rows={data.eventSpend} />
          )}
        </div>
      </section>
    </div>
  );
}

export function NextTicketCard({
  ticket,
}: {
  ticket: NonNullable<BuyerDashboardData["nextTicket"]>;
}) {
  return (
    <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm" aria-labelledby="next-ticket">
      <p className="text-xs font-medium uppercase tracking-wide text-gold-700">Tiket berikutnya</p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 id="next-ticket" className="truncate text-lg font-semibold text-ink">
            {ticket.title}
          </h2>
          <p className="mt-1 text-sm text-ink/60">{formatDateTime(ticket.startsAt)}</p>
          {ticket.venue ? <p className="text-sm text-ink/50">{ticket.venue}</p> : null}
        </div>
        <Link
          href={`/dashboard/ticket/${ticket.id}`}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-gold-500 px-4 text-sm font-semibold text-white hover:bg-gold-600"
        >
          Buka tiket
        </Link>
      </div>
    </section>
  );
}
