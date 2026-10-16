"use client";

import { useState } from "react";
import { inferDateFilterMode, resolveDateFilter, type DateFilterMode } from "@/lib/date-filter";

const defaultField =
  "mt-1 w-full min-h-11 rounded-lg border border-stone-200 bg-white px-3 text-ink";

export function DateFilterFields({
  dateFrom,
  dateTo,
  fieldClass = defaultField,
}: {
  dateFrom: string;
  dateTo: string;
  fieldClass?: string;
}) {
  const [mode, setMode] = useState<DateFilterMode>(() => inferDateFilterMode(dateFrom, dateTo));
  const [on, setOn] = useState(dateFrom && dateTo && dateFrom === dateTo ? dateFrom : "");
  const [from, setFrom] = useState(dateFrom);
  const [to, setTo] = useState(dateTo);

  function switchMode(next: DateFilterMode) {
    if (next === mode) return;
    if (next === "on") {
      setOn(from || to || on);
    } else {
      const seed = on || from;
      setFrom(from || seed);
      setTo(to || seed);
    }
    setMode(next);
  }

  const resolved = resolveDateFilter(mode, { dateOn: on, dateFrom: from, dateTo: to });

  return (
    <div className="min-w-0 sm:col-span-2">
      <p className="text-sm text-ink/70">Tanggal event</p>
      <input type="hidden" name="dateFrom" value={resolved.dateFrom} />
      <input type="hidden" name="dateTo" value={resolved.dateTo} />
      <div className="mt-1 inline-flex rounded-full border border-stone-200 bg-stone-50 p-0.5" role="group" aria-label="Cara pilih tanggal">
        <ModeButton active={mode === "on"} onClick={() => switchMode("on")}>
          Satu tanggal
        </ModeButton>
        <ModeButton active={mode === "range"} onClick={() => switchMode("range")}>
          Rentang
        </ModeButton>
      </div>
      {mode === "on" ? (
        <label className="mt-3 block text-sm text-ink/70">
          Tanggal
          <input
            type="date"
            value={on}
            onChange={(e) => setOn(e.target.value)}
            className={fieldClass}
          />
        </label>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-ink/70">
            Dari
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="block text-sm text-ink/70">
            Sampai
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={fieldClass}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-9 rounded-full px-3 text-sm font-medium ${
        active ? "bg-white text-ink shadow-sm" : "text-ink/60 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
