"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState, type ReactNode } from "react";
import { STATUS_LABEL, type EventStatus } from "@/components/events/event-types";

const STATUSES: EventStatus[] = ["DRAFT", "PENDING_REVIEW", "PUBLISHED", "REJECTED", "CANCELLED", "COMPLETED"];

const fieldClass = "mt-1 h-11 w-full min-w-0 rounded-lg border border-stone-200 bg-white px-3 text-sm text-ink";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 text-xs font-medium text-ink/60">
      {label}
      {children}
    </label>
  );
}

export function OrganizerEventFilters({
  categories,
  cities,
  provinces,
}: {
  categories: string[];
  cities: string[];
  provinces: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const current = useMemo(
    () => ({
      q: params.get("q") || "",
      status: params.get("status") || "",
      category: params.get("category") || "",
      city: params.get("city") || "",
      province: params.get("province") || "",
      dateFrom: params.get("dateFrom") || "",
      dateTo: params.get("dateTo") || "",
      sort: params.get("sort") || "soonest",
    }),
    [params],
  );
  const hasAdvanced = Boolean(current.status || current.category || current.city || current.province || current.dateFrom || current.sort !== "soonest");
  const [open, setOpen] = useState(hasAdvanced);

  function apply(next: Record<string, string>) {
    const sp = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => {
      if (v && !(k === "sort" && v === "soonest")) sp.set(k, v);
    });
    router.push(sp.toString() ? `/dashboard/event?${sp.toString()}` : "/dashboard/event");
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    apply({
      q: String(fd.get("q") || "").trim(),
      status: String(fd.get("status") || ""),
      category: String(fd.get("category") || ""),
      city: String(fd.get("city") || ""),
      province: String(fd.get("province") || ""),
      dateFrom: String(fd.get("dateFrom") || ""),
      dateTo: String(fd.get("dateTo") || ""),
      sort: String(fd.get("sort") || "soonest"),
    });
  }

  const chips = [
    current.q && { key: "q", label: `Kata kunci: ${current.q}` },
    current.status && { key: "status", label: `Status: ${STATUS_LABEL[current.status as EventStatus] || current.status}` },
    current.category && { key: "category", label: `Kategori: ${current.category}` },
    current.city && { key: "city", label: `Kota: ${current.city}` },
    current.province && { key: "province", label: `Provinsi: ${current.province}` },
    current.dateFrom && { key: "dateFrom", label: `${current.dateFrom}–${current.dateTo}` },
  ].filter(Boolean) as { key: string; label: string }[];

  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="min-w-0 flex-1 text-xs font-medium text-ink/60">
            Cari judul, kota, atau venue
            <input
              name="q"
              defaultValue={current.q}
              maxLength={100}
              className={fieldClass}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex h-11 items-center rounded-lg border border-stone-200 px-4 text-sm font-medium text-ink/80"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "Sembunyikan filter" : "Filter"}
            </button>
            <button type="submit" className="inline-flex h-11 items-center rounded-lg bg-gold-500 px-5 text-sm font-semibold text-white">
              Terapkan
            </button>
          </div>
        </div>

        {open ? (
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-stone-100 pt-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Status">
              <select name="status" defaultValue={current.status} className={fieldClass}>
                <option value="">Semua</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </Field>
            <Field label="Kategori">
              <select name="category" defaultValue={current.category} className={fieldClass}>
                <option value="">Semua</option>
                {categories.map((c) => (
                  <option key={c} value={c.toLowerCase()}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Kota">
              <select name="city" defaultValue={current.city} className={fieldClass}>
                <option value="">Semua</option>
                {cities.map((c) => (
                  <option key={c} value={c.toLowerCase()}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Provinsi">
              <select name="province" defaultValue={current.province} className={fieldClass}>
                <option value="">Semua</option>
                {provinces.map((p) => (
                  <option key={p} value={p.toLowerCase()}>{p}</option>
                ))}
              </select>
            </Field>
            <Field label="Dari">
              <input type="date" name="dateFrom" defaultValue={current.dateFrom} className={fieldClass} />
            </Field>
            <Field label="Sampai">
              <input type="date" name="dateTo" defaultValue={current.dateTo} className={fieldClass} />
            </Field>
            <Field label="Urutan">
              <select name="sort" defaultValue={current.sort} className={fieldClass}>
                <option value="soonest">Terdekat</option>
                <option value="newest">Terbaru</option>
              </select>
            </Field>
            <div className="flex items-end">
              <button type="button" className="h-11 text-sm text-gold-700 underline" onClick={() => router.push("/dashboard/event")}>
                Atur ulang
              </button>
            </div>
          </div>
        ) : (
          <>
            <input type="hidden" name="status" value={current.status} />
            <input type="hidden" name="category" value={current.category} />
            <input type="hidden" name="city" value={current.city} />
            <input type="hidden" name="province" value={current.province} />
            <input type="hidden" name="dateFrom" value={current.dateFrom} />
            <input type="hidden" name="dateTo" value={current.dateTo} />
            <input type="hidden" name="sort" value={current.sort} />
          </>
        )}
      </form>
      {chips.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Filter aktif">
          {chips.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                className="rounded-full border border-stone-300 bg-white px-3 py-1 text-sm text-ink"
                onClick={() => {
                  const next = { ...current };
                  if (c.key === "dateFrom") {
                    next.dateFrom = "";
                    next.dateTo = "";
                  } else {
                    next[c.key as keyof typeof next] = "";
                  }
                  apply(next);
                }}
              >
                {c.label} ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
