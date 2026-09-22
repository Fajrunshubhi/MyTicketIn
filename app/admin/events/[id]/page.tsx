"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { LoadingState } from "@/components/ui/LoadingState";
import { apiFetch, readApiError } from "@/lib/api";
import { formatDateTime, formatRupiah } from "@/lib/format";
import { STATUS_LABEL, type EventRecord, type TicketTypeRecord } from "@/components/events/event-types";

export default function AdminEventDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [tickets, setTickets] = useState<TicketTypeRecord[]>([]);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState("APPROVE");
  const [cancelReason, setCancelReason] = useState("");

  function load() {
    fetch(`/api/admin/events/${params.id}`, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace(`/login?callbackUrl=/admin/events/${params.id}`);
          return;
        }
        if (res.status === 403) {
          setForbidden(true);
          return;
        }
        if (!res.ok) {
          setError(readApiError(body, "Event tidak ditemukan."));
          return;
        }
        setEvent(body.data.event as EventRecord);
        setTickets((body.data.ticketTypes || []) as TicketTypeRecord[]);
        setVersion(Number(body.data.version || body.data.event?.version || 0));
      })
      .catch(() => setError("Tidak dapat terhubung ke layanan."));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function onDecide(e: FormEvent) {
    e.preventDefault();
    if (!event) return;
    setError("");
    const res = await apiFetch(`/api/admin/events/${event.id}/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason, expectedVersion: version }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(readApiError(body, "Keputusan gagal."));
      return;
    }
    load();
  }

  async function onCancel() {
    if (!event) return;
    const res = await apiFetch(`/api/admin/events/${event.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: cancelReason, expectedVersion: version }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(readApiError(body, "Pembatalan gagal."));
      return;
    }
    load();
  }

  return (
    <div>
      <Container>
        <h1 className="font-display text-3xl text-ink">Keputusan event</h1>
        {forbidden ? <div className="mt-6"><Alert tone="error" title="Akses ditolak">Hanya admin.</Alert></div> : null}
        {error ? <div className="mt-6"><Alert tone="error" title="Gagal">{error}</Alert></div> : null}
        {!event && !forbidden && !error ? <div className="mt-6"><LoadingState /></div> : null}
        {event ? (
          <div className="mt-6 space-y-6">
            <p>
              <span aria-label={STATUS_LABEL[event.status]}>{STATUS_LABEL[event.status]}</span>
              {" · "}
              {event.title}
            </p>
            <p className="whitespace-pre-wrap text-ink/80">{event.description}</p>
            <p>{event.venueName}, {event.city}</p>
            <p>
              <time dateTime={event.startsAt}>{formatDateTime(event.startsAt, event.timezone)}</time>
              {" – "}
              <time dateTime={event.endsAt}>{formatDateTime(event.endsAt, event.timezone)}</time>
            </p>
            <ul>
              {tickets.map((t) => (
                <li key={t.id}>{t.name} · {formatRupiah(t.priceRupiah)} · kuota {t.quota}</li>
              ))}
            </ul>
            {event.status === "PENDING_REVIEW" ? (
              <form onSubmit={onDecide} className="grid max-w-xl gap-3">
                <label htmlFor="decision" className="text-sm font-medium">Keputusan</label>
                <select id="decision" className="min-h-11 rounded-md border border-stone-300 bg-white px-3" value={decision} onChange={(e) => setDecision(e.target.value)}>
                  <option value="APPROVE">Setujui (terbitkan)</option>
                  <option value="REJECT">Tolak</option>
                </select>
                <label htmlFor="reason" className="text-sm font-medium">Alasan (wajib untuk tolak)</label>
                <textarea id="reason" className="min-h-24 rounded-md border border-stone-300 bg-white px-3 py-2" value={reason} onChange={(e) => setReason(e.target.value)} />
                <Button type="submit">Simpan keputusan</Button>
              </form>
            ) : null}
            {event.status === "PENDING_REVIEW" || event.status === "PUBLISHED" || event.status === "REJECTED" ? (
              <div className="grid max-w-xl gap-3">
                <label htmlFor="cancelReason" className="text-sm font-medium">Alasan pembatalan admin</label>
                <textarea id="cancelReason" className="min-h-20 rounded-md border border-stone-300 bg-white px-3 py-2" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                <Button type="button" onClick={onCancel}>Batalkan event</Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Container>
    </div>
  );
}
