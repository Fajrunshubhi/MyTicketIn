"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { FormFieldWide, FormSection } from "@/components/ui/FormSection";
import { LoadingState } from "@/components/ui/LoadingState";
import {
  DecisionChoice,
  DecisionReasonField,
  ReviewBackLink,
  ReviewDecisionCard,
  ReviewField,
  ReviewStatusBadge,
} from "@/components/admin/AdminReview";
import { MODE_LABEL, STATUS_LABEL, type EventRecord, type TicketTypeRecord } from "@/components/events/event-types";
import { apiFetch, readApiError } from "@/lib/api";
import { formatDateTime, formatRupiah } from "@/lib/format";

export default function AdminEventDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [tickets, setTickets] = useState<TicketTypeRecord[]>([]);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState("APPROVE");
  const [cancelReason, setCancelReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

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
    setOk("");
    setSaving(true);
    const res = await apiFetch(`/api/admin/events/${event.id}/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason, expectedVersion: version }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(readApiError(body, "Keputusan gagal."));
      return;
    }
    setReason("");
    setOk("Keputusan event tersimpan.");
    load();
  }

  async function onCancel(e: FormEvent) {
    e.preventDefault();
    if (!event) return;
    setError("");
    setOk("");
    setCancelling(true);
    const res = await apiFetch(`/api/admin/events/${event.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: cancelReason, expectedVersion: version }),
    });
    const body = await res.json().catch(() => ({}));
    setCancelling(false);
    if (!res.ok) {
      setError(readApiError(body, "Pembatalan gagal."));
      return;
    }
    setCancelReason("");
    setOk("Event dibatalkan.");
    load();
  }

  const canDecide = event?.status === "PENDING_REVIEW";
  const canCancel =
    event?.status === "PENDING_REVIEW" || event?.status === "PUBLISHED" || event?.status === "REJECTED";

  return (
    <Container>
      <ReviewBackLink href="/admin/events">Kembali ke antrean</ReviewBackLink>
      {forbidden ? (
        <div className="mt-6">
          <Alert tone="error" title="Akses ditolak">
            Hanya admin yang dapat memoderasi event.
          </Alert>
        </div>
      ) : null}
      {error ? (
        <div className="mt-6">
          <Alert tone="error" title="Gagal">
            {error}
          </Alert>
        </div>
      ) : null}
      {ok ? (
        <div className="mt-6">
          <Alert tone="success" title="Berhasil">
            {ok}
          </Alert>
        </div>
      ) : null}
      {!event && !forbidden && !error ? (
        <div className="mt-6">
          <LoadingState />
        </div>
      ) : null}

      {event ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="space-y-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Berkas event</p>
                <h2 className="mt-1 font-display text-2xl text-ink">{event.title}</h2>
                <p className="mt-1 text-sm text-ink/55">
                  {event.submittedAt ? (
                    <>
                      Diajukan <time dateTime={event.submittedAt}>{formatDateTime(event.submittedAt, event.timezone)}</time>
                    </>
                  ) : (
                    "Belum ada stempel pengajuan"
                  )}
                </p>
              </div>
              <ReviewStatusBadge status={event.status} label={STATUS_LABEL[event.status]} />
            </header>

            <FormSection title="Jadwal & lokasi">
              <ReviewField label="Mulai">
                <time dateTime={event.startsAt}>{formatDateTime(event.startsAt, event.timezone)}</time>
              </ReviewField>
              <ReviewField label="Selesai">
                <time dateTime={event.endsAt}>{formatDateTime(event.endsAt, event.timezone)}</time>
              </ReviewField>
              <ReviewField label="Venue">{event.venueName}</ReviewField>
              <ReviewField label="Kota">
                {event.city}
                {event.province ? `, ${event.province}` : ""}
              </ReviewField>
              <FormFieldWide>
                <ReviewField label="Alamat">{event.addressLine || "—"}</ReviewField>
              </FormFieldWide>
            </FormSection>

            <FormSection title="Katalog">
              <ReviewField label="Kategori">{event.category}</ReviewField>
              <ReviewField label="Mode inventori">{MODE_LABEL[event.inventoryMode]}</ReviewField>
              <FormFieldWide>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{event.description}</p>
              </FormFieldWide>
            </FormSection>

            <FormSection title="Tiket">
              <FormFieldWide>
                {tickets.length === 0 ? (
                  <p className="text-sm text-ink/55">Belum ada tipe tiket.</p>
                ) : (
                  <ul className="divide-y divide-stone-100">
                    {tickets.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                        <span className="font-medium text-ink">{t.name}</span>
                        <span className="text-ink/60">
                          {formatRupiah(t.priceRupiah)} · kuota {t.quota}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </FormFieldWide>
            </FormSection>

            {event.moderationReason ? (
              <FormSection title="Catatan moderasi terakhir">
                <FormFieldWide>
                  <p className="whitespace-pre-wrap text-sm text-ink">{event.moderationReason}</p>
                </FormFieldWide>
              </FormSection>
            ) : null}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto">
            {canDecide ? (
              <ReviewDecisionCard
                title="Ambil keputusan"
                description="Setujui untuk menerbitkan, atau tolak dengan alasan yang dapat ditindaklanjuti organizer."
                onSubmit={onDecide}
                submitting={saving}
                submitLabel={decision === "REJECT" ? "Simpan: Tolak" : "Simpan: Terbitkan"}
                submitVariant={decision === "REJECT" ? "danger" : "primary"}
              >
                <DecisionChoice
                  name="event-decision"
                  value={decision}
                  onChange={setDecision}
                  options={[
                    {
                      id: "APPROVE",
                      label: "Setujui (terbitkan)",
                      hint: "Event tampil di katalog publik sesuai jadwal penjualan.",
                    },
                    {
                      id: "REJECT",
                      label: "Tolak",
                      hint: "Organizer harus memperbaiki dan mengajukan ulang.",
                    },
                  ]}
                />
                <DecisionReasonField
                  id="reason"
                  value={reason}
                  onChange={setReason}
                  required={decision === "REJECT"}
                  hint={
                    decision === "REJECT"
                      ? "Wajib 10–1000 karakter. Jelaskan apa yang harus diperbaiki."
                      : "Opsional untuk persetujuan. Dikosongkan jika tidak ada catatan."
                  }
                />
              </ReviewDecisionCard>
            ) : (
              <aside className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-base font-semibold text-ink">Moderasi selesai</h2>
                <p className="mt-2 text-sm text-ink/65">Event ini tidak menunggu tinjauan. Pembatalan admin tetap tersedia jika status memungkinkan.</p>
              </aside>
            )}

            {canCancel ? (
              <details className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm open:pb-5 sm:p-6">
                <summary className="cursor-pointer list-none text-base font-semibold text-ink marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-3">
                    Batalkan event
                    <span className="text-xs font-medium text-ink/45">Aksi permanen</span>
                  </span>
                </summary>
                <p className="mt-2 text-sm text-ink/60">
                  Jangan dipakai untuk menolak pengajuan. Tolak lewat keputusan di atas. Pembatalan menghentikan alur jual secara permanen.
                </p>
                <form onSubmit={onCancel} className="mt-4 space-y-4">
                  <DecisionReasonField
                    id="cancelReason"
                    label="Alasan pembatalan"
                    value={cancelReason}
                    onChange={setCancelReason}
                    hint="Wajib 10–1000 karakter. Tercatat pada event dan jejak audit."
                  />
                  <Button type="submit" className="w-full" loading={cancelling} variant="danger">
                    Batalkan event
                  </Button>
                </form>
              </details>
            ) : null}
          </aside>
        </div>
      ) : null}
    </Container>
  );
}
