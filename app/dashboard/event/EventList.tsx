"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { LoadingState } from "@/components/ui/LoadingState";
import { OrganizerEventCard } from "@/components/dashboard/OrganizerEventCard";
import { OrganizerEventFilters } from "@/components/dashboard/OrganizerEventFilters";
import { type EventRecord } from "@/components/events/event-types";
import { readApiError } from "@/lib/api";

export function DashboardEventList() {
  const router = useRouter();
  const sp = useSearchParams();
  const q = (sp.get("q") || "").trim().toLowerCase();
  const status = (sp.get("status") || "").trim();
  const category = (sp.get("category") || "").trim().toLowerCase();
  const city = (sp.get("city") || "").trim().toLowerCase();
  const province = (sp.get("province") || "").trim().toLowerCase();
  const dateFrom = sp.get("dateFrom") || "";
  const dateTo = sp.get("dateTo") || "";
  const sort = sp.get("sort") || "soonest";
  const [items, setItems] = useState<EventRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/organizer/events?limit=50", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace("/login?callbackUrl=/dashboard/event&portal=organizer");
          return;
        }
        if (res.status === 403) {
          router.replace("/dashboard");
          return;
        }
        if (!res.ok) {
          setError(readApiError(body, "Gagal memuat event."));
          setLoading(false);
          return;
        }
        setItems((body.data?.items || []) as EventRecord[]);
        setLoading(false);
      })
      .catch(() => {
        setError("Tidak dapat terhubung ke layanan.");
        setLoading(false);
      });
  }, [router]);

  const filterOptions = useMemo(() => {
    const categories = [...new Set(items.map((e) => e.category).filter(Boolean))].sort();
    const cities = [...new Set(items.map((e) => e.city).filter(Boolean))].sort();
    const provinces = [...new Set(items.map((e) => e.province).filter(Boolean))].sort();
    return { categories, cities, provinces };
  }, [items]);

  const visible = useMemo(() => {
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;
    const rows = items.filter((item) => {
      if (q) {
        const hay = [item.title, item.city, item.venueName, item.category].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (status && item.status !== status) return false;
      if (category && item.category.toLowerCase() !== category) return false;
      if (city && item.city.toLowerCase() !== city) return false;
      if (province && item.province.toLowerCase() !== province) return false;
      const start = new Date(item.startsAt).getTime();
      if (from && !Number.isNaN(from.getTime()) && start < from.getTime()) return false;
      if (to && !Number.isNaN(to.getTime()) && start > to.getTime()) return false;
      return true;
    });
    rows.sort((a, b) => {
      if (sort === "newest") {
        return new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime();
      }
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    });
    return rows;
  }, [items, q, status, category, city, province, dateFrom, dateTo, sort]);

  return (
    <div>
      <p className="max-w-2xl text-ink/65">Kelola draf dan event terbit milik Anda. Event pending belum tampil di katalog publik.</p>
      {loading ? <div className="mt-6"><LoadingState /></div> : (
        <div className="mt-6">
          <OrganizerEventFilters
            categories={filterOptions.categories}
            cities={filterOptions.cities}
            provinces={filterOptions.provinces}
          />
        </div>
      )}
      {error ? <div className="mt-6"><Alert tone="error" title="Tidak dapat memuat">{error}</Alert></div> : null}
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {visible.map((item) => (
          <li key={item.id}>
            <OrganizerEventCard event={item} />
          </li>
        ))}
      </ul>
      {!loading && !error && visible.length === 0 ? <p className="mt-6 text-ink/70">Belum ada event yang cocok.</p> : null}
    </div>
  );
}
