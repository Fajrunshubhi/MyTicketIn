"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

type Filters = { categories: string[]; locations: { city: string; province: string }[] };

export function CatalogFilters({ filters }: { filters: Filters }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [natural, setNatural] = useState("");
  const [notice, setNotice] = useState("");

  const current = useMemo(
    () => ({
      q: params.get("q") || "",
      category: params.get("category") || "",
      city: params.get("city") || "",
      province: params.get("province") || "",
      dateFrom: params.get("dateFrom") || "",
      dateTo: params.get("dateTo") || "",
      tag: params.get("tag") || "",
      sort: params.get("sort") || "soonest",
    }),
    [params]
  );

  function apply(next: Record<string, string>) {
    const sp = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => {
      if (v && !(k === "sort" && v === "soonest")) sp.set(k, v);
    });
    router.push(sp.toString() ? `/events?${sp.toString()}` : "/events");
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    apply({
      q: String(fd.get("q") || "").trim(),
      category: String(fd.get("category") || ""),
      city: String(fd.get("city") || ""),
      province: String(fd.get("province") || ""),
      dateFrom: String(fd.get("dateFrom") || ""),
      dateTo: String(fd.get("dateTo") || ""),
      tag: current.tag,
      sort: String(fd.get("sort") || "soonest"),
    });
    setOpen(false);
  }

  async function onNatural(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    const res = await fetch("/api/events/ai-filter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ naturalLanguage: natural }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNotice(body.error?.message || "Teks tidak valid.");
      return;
    }
    if (body.data?.notice) setNotice(body.data.notice);
    const q = body.data?.canonicalQuery || "";
    router.push(q ? `/events?${q}` : "/events");
  }

  const chips = [
    current.q && { key: "q", label: `Kata kunci: ${current.q}` },
    current.category && { key: "category", label: `Kategori: ${current.category}` },
    current.city && { key: "city", label: `Kota: ${current.city}` },
    current.province && { key: "province", label: `Provinsi: ${current.province}` },
    current.tag && { key: "tag", label: `Tag: ${current.tag}` },
    current.dateFrom && { key: "dateFrom", label: `${current.dateFrom}–${current.dateTo}` },
  ].filter(Boolean) as { key: string; label: string }[];

  return (
    <div className="space-y-4">
      <form onSubmit={onNatural} className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="block">
          <span className="sr-only">Cari dengan bahasa alami</span>
          <input
            value={natural}
            onChange={(e) => setNatural(e.target.value)}
            minLength={2}
            maxLength={300}
            placeholder="Contoh: konser musik di Bandung minggu ini"
            className="w-full min-h-11 rounded-xl border border-stone-200 bg-white px-4 py-3 text-ink"
          />
        </label>
        <button type="submit" className="min-h-11 rounded-xl border border-gold-400 px-4 text-gold-800">
          Terjemahkan
        </button>
      </form>
      {notice ? <p className="text-sm text-amber-800" role="status">{notice}</p> : null}

      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm text-ink/70">Cari judul</span>
          <input name="q" defaultValue={current.q} maxLength={100} className="w-full min-h-11 rounded-xl border border-stone-200 bg-white px-4 text-ink" />
        </label>
        <button type="button" className="text-sm text-gold-700 underline" onClick={() => setOpen((v) => !v)}>
          {open ? "Sembunyikan filter" : "Filter"}
        </button>
        {open ? (
          <div className="grid gap-3 rounded-xl border border-stone-200 p-4 sm:grid-cols-2">
            <label className="block text-sm text-ink/70">
              Kategori
              <select name="category" defaultValue={current.category} className="mt-1 w-full min-h-11 rounded-lg bg-white px-3 text-ink">
                <option value="">Semua</option>
                {filters.categories.map((c) => (
                  <option key={c} value={c.toLowerCase()}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-ink/70">
              Kota
              <select name="city" defaultValue={current.city} className="mt-1 w-full min-h-11 rounded-lg bg-white px-3 text-ink">
                <option value="">Semua</option>
                {filters.locations.map((l) => (
                  <option key={`${l.city}-${l.province}`} value={l.city.toLowerCase()}>{l.city}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-ink/70">
              Provinsi
              <select name="province" defaultValue={current.province} className="mt-1 w-full min-h-11 rounded-lg bg-white px-3 text-ink">
                <option value="">Semua</option>
                {[...new Set(filters.locations.map((l) => l.province))].map((p) => (
                  <option key={p} value={p.toLowerCase()}>{p}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-ink/70">
              Dari
              <input type="date" name="dateFrom" defaultValue={current.dateFrom} className="mt-1 w-full min-h-11 rounded-lg bg-white px-3 text-ink" />
            </label>
            <label className="block text-sm text-ink/70">
              Sampai
              <input type="date" name="dateTo" defaultValue={current.dateTo} className="mt-1 w-full min-h-11 rounded-lg bg-white px-3 text-ink" />
            </label>
            <label className="block text-sm text-ink/70">
              Urutan
              <select name="sort" defaultValue={current.sort} className="mt-1 w-full min-h-11 rounded-lg bg-white px-3 text-ink">
                <option value="soonest">Terdekat</option>
                <option value="newest">Terbaru</option>
              </select>
            </label>
          </div>
        ) : (
          <>
            <input type="hidden" name="category" value={current.category} />
            <input type="hidden" name="city" value={current.city} />
            <input type="hidden" name="province" value={current.province} />
            <input type="hidden" name="dateFrom" value={current.dateFrom} />
            <input type="hidden" name="dateTo" value={current.dateTo} />
            <input type="hidden" name="tag" value={current.tag} />
            <input type="hidden" name="sort" value={current.sort} />
          </>
        )}
        <button type="submit" className="min-h-11 rounded-full bg-gold-500 px-4 font-semibold text-white">
          Terapkan
        </button>
      </form>

      {chips.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Filter aktif">
          {chips.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                className="rounded-full border border-stone-300 px-3 py-1 text-sm text-ink"
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
          <li>
            <button type="button" className="text-sm text-gold-700 underline" onClick={() => router.push("/events")}>
              Hapus filter
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
