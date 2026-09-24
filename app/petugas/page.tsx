"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { apiFetch, readApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type EventRow = { id: string; title: string; startsAt: string; venueName: string };

export default function StaffHomePage() {
  const [items, setItems] = useState<EventRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/staff/events")
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(readApiError(body, "Gagal memuat event."));
          return;
        }
        setItems((body.data?.items || []) as EventRow[]);
      })
      .catch(() => setError("Tidak dapat terhubung ke layanan."));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-ink">Event yang ditugaskan</h1>
        <p className="mt-2 text-sm text-ink/65">Pilih event untuk memindai tiket. Check-in hanya berhasil satu kali per tiket.</p>
      </div>
      {error ? <Alert tone="error" title="Gagal">{error}</Alert> : null}
      {items.length === 0 && !error ? (
        <Alert tone="info" title="Belum ada tugas">Penyelenggara belum menugaskan Anda ke event.</Alert>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <p className="font-semibold text-ink">{item.title}</p>
              <p className="mt-1 text-sm text-ink/60">
                {item.venueName} · {formatDateTime(item.startsAt)}
              </p>
              <Link
                href={`/petugas/event/${item.id}/scanner`}
                className="mt-3 inline-flex min-h-11 items-center rounded-full bg-gold-500 px-4 text-sm font-semibold text-white"
              >
                Buka scanner
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
