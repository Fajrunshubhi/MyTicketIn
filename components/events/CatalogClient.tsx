"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CatalogFilters } from "@/components/events/CatalogFilters";
import { EventCard } from "@/components/events/EventCard";
import { Alert } from "@/components/ui/Alert";
import { LoadingState } from "@/components/ui/LoadingState";
import type { CatalogCard } from "@/components/events/catalog-types";

export function CatalogClient() {
  const params = useSearchParams();
  const [items, setItems] = useState<CatalogCard[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [filters, setFilters] = useState<{ categories: string[]; locations: { city: string; province: string }[] }>({
    categories: [],
    locations: [],
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const qs = params.toString();
  const hasFilter = Boolean(params.get("q") || params.get("category") || params.get("city") || params.get("province") || params.get("dateFrom") || params.get("tag"));

  useEffect(() => {
    fetch("/api/events/filters", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setFilters({ categories: b.data?.categories || [], locations: b.data?.locations || [] }))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/events${qs ? `?${qs}` : ""}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error?.message || "Katalog sedang tidak tersedia.");
          setItems([]);
          return;
        }
        setItems(body.data?.items || []);
        setNext(body.data?.nextCursor || null);
      })
      .catch(() => setError("Tidak dapat terhubung ke layanan."))
      .finally(() => setLoading(false));
  }, [qs]);

  async function loadMore() {
    if (!next) return;
    const sp = new URLSearchParams(qs);
    sp.set("cursor", next);
    const res = await fetch(`/api/events?${sp.toString()}`);
    const body = await res.json();
    setItems((cur) => [...cur, ...(body.data?.items || [])]);
    setNext(body.data?.nextCursor || null);
  }

  return (
    <div className="space-y-6">
      <CatalogFilters filters={filters} />
      <p className="sr-only" aria-live="polite">
        {loading ? "Memuat katalog" : `${items.length} event`}
      </p>
      {loading ? <LoadingState /> : null}
      {error ? <Alert tone="error" title="Katalog gagal dimuat">{error}</Alert> : null}
      {!loading && !error && items.length === 0 ? (
        <Alert tone="info" title={hasFilter ? "Tidak ada event untuk filter ini" : "Belum ada event"}>
          {hasFilter ? "Hapus filter untuk melihat katalog." : "Event Published akan tampil di sini."}
        </Alert>
      ) : null}
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <EventCard key={item.slug} item={item} />)}</ul>
      {next ? (
        <button type="button" onClick={loadMore} className="min-h-11 rounded-full border border-stone-300 bg-paper px-4 font-medium text-ink">
          Muat berikutnya
        </button>
      ) : null}
    </div>
  );
}
