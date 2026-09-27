"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { LoadingState } from "@/components/ui/LoadingState";
import { OrganizerEventCard } from "@/components/dashboard/OrganizerEventCard";
import { OrganizerEventFilters } from "@/components/dashboard/OrganizerEventFilters";
import { type EventRecord } from "@/components/events/event-types";
import { readApiError } from "@/lib/api";
import { eventLifecycle } from "@/lib/format";

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

  const active = useMemo(
    () => visible.filter((item) => eventLifecycle(item.status, item.startsAt, item.endsAt).key !== "ended"),
    [visible],
  );
  const ended = useMemo(() => {
    const rows = visible.filter((item) => eventLifecycle(item.status, item.startsAt, item.endsAt).key === "ended");
    return [...rows].sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime());
  }, [visible]);

  return (
    <div>
      <p className="max-w-2xl text-ink/65">
        Kelola draf dan event terbit milik Anda. Event yang sudah dilaksanakan ditampilkan terpisah di bawah. Event pending belum tampil di katalog publik.
      </p>
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

      <section className="mt-8" aria-labelledby="event-aktif-heading">
        <h2 id="event-aktif-heading" className="text-2xl font-semibold tracking-tight text-ink">
          Draf dan event aktif
        </h2>
        <p className="mt-2 max-w-2xl text-ink/65">Event yang belum atau sedang berlangsung, termasuk draf dan pengajuan moderasi.</p>
        {loading || error ? null : active.length === 0 ? (
          <p className="mt-6 text-ink/70">Belum ada draf atau event aktif yang cocok.</p>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {active.map((item) => (
              <li key={item.id}>
                <OrganizerEventCard event={item} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {!loading && !error ? (
        <section className="mt-16 pb-4" aria-labelledby="event-selesai-heading">
          <h2 id="event-selesai-heading" className="text-2xl font-semibold tracking-tight text-ink">
            Event yang telah selesai
          </h2>
          <p className="mt-2 max-w-2xl text-ink/65">
            Event yang sudah dilaksanakan. Tiket tidak lagi dijual. Kartu tetap dapat dibuka untuk laporan, peserta, dan riwayat check-in.
          </p>
          {ended.length === 0 ? (
            <p className="mt-6 text-ink/70">Belum ada event yang selesai ditampilkan.</p>
          ) : (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {ended.map((item) => (
                <li key={item.id}>
                  <OrganizerEventCard event={item} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
