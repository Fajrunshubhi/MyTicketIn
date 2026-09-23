"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { formatDateTime } from "@/lib/format";
import { readApiError } from "@/lib/api";

export type ParticipantRow = {
  id: string;
  ticketNumber: string;
  orderNumber: string;
  holderName: string;
  holderEmail: string;
  holderPhone: string;
  holderIdentityNumber: string;
  ticketTypeName: string;
  sectionName: string;
  seatLabel: string;
  status: string;
  issuedAt: string | null;
  usedAt: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  UNUSED: "Belum check-in",
  USED: "Sudah check-in",
  CANCELLED: "Dibatalkan",
};

function safeTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return formatDateTime(iso);
  } catch {
    return iso;
  }
}

export function OrganizerBuyersPanel({
  events,
  selectedEventId,
  onSelectEvent,
}: {
  events: { id: string; title: string }[];
  selectedEventId: string;
  onSelectEvent: (eventId: string) => void;
}) {
  const [items, setItems] = useState<ParticipantRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedEventId) {
      setItems([]);
      setError("");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/organizer/events/${encodeURIComponent(selectedEventId)}/participants`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(readApiError(body, "Daftar pembeli gagal dimuat."));
          setItems([]);
          return;
        }
        setItems(((body.data as { items?: ParticipantRow[] })?.items || []));
      })
      .catch(() => {
        if (!cancelled) {
          setError("Daftar pembeli gagal dimuat.");
          setItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEventId]);

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5" aria-labelledby="pembeli-tiket">
      <h2 id="pembeli-tiket" className="font-display text-2xl text-ink">Pembeli tiket</h2>
      <p className="mt-1 text-sm text-ink/65">Pilih satu event milik Anda untuk melihat biodata pemegang tiket Paid.</p>
      <label className="mt-4 block text-sm text-ink/80">
        Event
        <select
          className="mt-1 block min-h-11 w-full max-w-lg rounded-md border border-stone-300 bg-white p-2"
          value={selectedEventId}
          onChange={(e) => onSelectEvent(e.target.value)}
        >
          <option value="">Pilih event…</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title}
            </option>
          ))}
        </select>
      </label>
      {!selectedEventId ? (
        <p className="mt-4 text-sm text-ink/60">Biodata tidak ditampilkan sampai event dipilih.</p>
      ) : null}
      {loading ? <p className="mt-4 text-sm text-ink/60">Memuat pembeli…</p> : null}
      {error ? (
        <div className="mt-4">
          <Alert tone="error" title={error} />
        </div>
      ) : null}
      {selectedEventId && !loading && !error && items.length === 0 ? (
        <p className="mt-4 text-sm text-ink/60">Belum ada tiket Paid untuk event ini.</p>
      ) : null}
      {selectedEventId && items.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-sm text-ink/85">
            <caption className="sr-only">Daftar pemegang tiket event yang dipilih</caption>
            <thead>
              <tr className="border-b border-stone-200 text-ink/55">
                <th className="py-2 pr-3 font-medium">Pemegang</th>
                <th className="py-2 pr-3 font-medium">Kontak</th>
                <th className="py-2 pr-3 font-medium">NIK</th>
                <th className="py-2 pr-3 font-medium">Tiket</th>
                <th className="py-2 pr-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-stone-100 align-top">
                  <td className="py-3 pr-3">
                    <p className="font-semibold text-ink">{row.holderName || "—"}</p>
                    <p className="text-xs text-ink/55">Order {row.orderNumber}</p>
                  </td>
                  <td className="py-3 pr-3">
                    <p>{row.holderEmail || "—"}</p>
                    <p className="text-xs text-ink/55">{row.holderPhone || "HP tidak tercatat"}</p>
                  </td>
                  <td className="py-3 pr-3 font-mono text-xs">{row.holderIdentityNumber || "—"}</td>
                  <td className="py-3 pr-3">
                    <p>{row.ticketTypeName || "—"}</p>
                    <p className="text-xs text-ink/55">
                      {row.ticketNumber}
                      {row.sectionName ? ` · ${row.sectionName}` : ""}
                      {row.seatLabel ? ` · kursi ${row.seatLabel}` : ""}
                    </p>
                  </td>
                  <td className="py-3 pr-3">
                    <p>{STATUS_LABEL[row.status] || row.status}</p>
                    <p className="text-xs text-ink/55">Terbit {safeTime(row.issuedAt)}</p>
                    {row.usedAt ? <p className="text-xs text-ink/55">Check-in {safeTime(row.usedAt)}</p> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
