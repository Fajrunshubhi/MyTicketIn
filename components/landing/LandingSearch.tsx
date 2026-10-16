"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { resolveDateFilter, type DateFilterMode } from "@/lib/date-filter";

const control =
  "w-full min-w-0 flex-1 truncate bg-transparent p-0 text-[15px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink/40";

export function LandingSearch({ cities }: { cities: string[] }) {
  const router = useRouter();
  const [dateMode, setDateMode] = useState<DateFilterMode>("on");
  const [dateOn, setDateOn] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  function switchDateMode(next: DateFilterMode) {
    if (next === dateMode) return;
    if (next === "on") {
      setDateOn(dateFrom || dateTo || dateOn);
    } else {
      const seed = dateOn || dateFrom;
      setDateFrom(dateFrom || seed);
      setDateTo(dateTo || seed);
    }
    setDateMode(next);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const dates = resolveDateFilter(dateMode, {
      dateOn,
      dateFrom,
      dateTo,
    });
    const sp = new URLSearchParams();
    const q = String(fd.get("q") || "").trim();
    const city = String(fd.get("city") || "");
    if (q) sp.set("q", q);
    if (city) sp.set("city", city);
    if (dates.dateFrom) sp.set("dateFrom", dates.dateFrom);
    if (dates.dateTo) sp.set("dateTo", dates.dateTo);
    router.push(sp.toString() ? `/events?${sp.toString()}` : "/events");
  }

  return (
    <form
      action="/events"
      onSubmit={onSubmit}
      className="relative z-10 mx-auto -mt-6 w-[min(100%,56rem)] rounded-3xl border border-stone-200/90 bg-white p-1.5 shadow-[0_28px_64px_-28px_rgba(28,22,54,0.42)] sm:-mt-10 sm:rounded-[28px] sm:p-2"
    >
      <div className="grid gap-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.15fr)_auto] lg:items-stretch">
        <label className="flex min-w-0 cursor-text flex-col overflow-hidden rounded-[22px] px-4 py-3 hover:bg-[#f7f5fc] focus-within:bg-[#f7f5fc] focus-within:ring-2 focus-within:ring-gold-400/50">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-700">Mencari</span>
          <span className="mt-1.5 flex min-w-0 items-center gap-2">
            <Icon name="search" className="h-4 w-4 shrink-0 text-ink/40" />
            <input name="q" placeholder="Konser, festival, seminar…" className={control} autoComplete="off" />
          </span>
        </label>

        <label className="flex min-w-0 flex-col overflow-hidden rounded-[22px] px-4 py-3 hover:bg-[#f7f5fc] focus-within:bg-[#f7f5fc] focus-within:ring-2 focus-within:ring-gold-400/50 lg:border-l lg:border-stone-100">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-700">Lokasi</span>
          <span className="mt-1.5 flex min-w-0 items-center gap-2">
            <Icon name="pin" className="h-4 w-4 shrink-0 text-ink/40" />
            <select
              name="city"
              defaultValue=""
              className={`${control} cursor-pointer appearance-none bg-white [&>option]:bg-white [&>option]:text-ink`}
            >
              <option value="">Semua lokasi</option>
              {cities.map((city) => (
                <option key={city} value={city.toLowerCase()}>
                  {city}
                </option>
              ))}
            </select>
            <Icon name="chevron" className="pointer-events-none h-4 w-4 shrink-0 text-ink/35" />
          </span>
        </label>

        <div className="flex min-w-0 flex-col overflow-hidden rounded-[22px] px-4 py-3 hover:bg-[#f7f5fc] focus-within:bg-[#f7f5fc] focus-within:ring-2 focus-within:ring-gold-400/50 lg:border-l lg:border-stone-100">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-700">Tanggal</span>
            <div className="inline-flex rounded-full bg-stone-100 p-0.5" role="group" aria-label="Cara pilih tanggal">
              <button
                type="button"
                aria-pressed={dateMode === "on"}
                onClick={() => switchDateMode("on")}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${dateMode === "on" ? "bg-white text-ink shadow-sm" : "text-ink/50"}`}
              >
                Satu hari
              </button>
              <button
                type="button"
                aria-pressed={dateMode === "range"}
                onClick={() => switchDateMode("range")}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${dateMode === "range" ? "bg-white text-ink shadow-sm" : "text-ink/50"}`}
              >
                Rentang
              </button>
            </div>
          </div>
          {dateMode === "on" ? (
            <label className="mt-1.5 flex min-w-0 items-center gap-2">
              <span className="sr-only">Tanggal event</span>
              <Icon name="calendar" className="h-4 w-4 shrink-0 text-ink/40" />
              <input
                type="date"
                value={dateOn}
                onChange={(e) => setDateOn(e.target.value)}
                className={`${control} [color-scheme:light]`}
              />
            </label>
          ) : (
            <div className="mt-1.5 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex min-w-0 items-center gap-1.5">
                <span className="sr-only">Dari tanggal</span>
                <Icon name="calendar" className="h-4 w-4 shrink-0 text-ink/40" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className={`${control} [color-scheme:light]`}
                />
              </label>
              <label className="flex min-w-0 items-center gap-1.5">
                <span className="sr-only">Sampai tanggal</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className={`${control} [color-scheme:light]`}
                />
              </label>
            </div>
          )}
        </div>

        <div className="flex items-end p-1 lg:items-center lg:pl-2">
          <button
            type="submit"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gold-500 px-6 text-sm font-semibold text-white shadow-soft hover:bg-gold-600 lg:w-auto"
          >
            <Icon name="search" className="h-4 w-4" />
            Cari
          </button>
        </div>
      </div>
    </form>
  );
}
