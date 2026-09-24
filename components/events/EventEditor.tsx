"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, getCsrfToken, readApiError, type ApiError } from "@/lib/api";
import { formatDateTime, formatRupiah, naiveLocalToUtcIso, utcIsoToNaiveLocal } from "@/lib/format";
import { Alert } from "@/components/ui/Alert";
import { FloatingAlert } from "@/components/ui/FloatingAlert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EventForm } from "@/components/events/EventForm";
import { FormFieldWide, FormSection } from "@/components/ui/FormSection";
import {
  MODE_LABEL,
  STATUS_LABEL,
  type EventRecord,
  type SeatMapRecord,
  type SeatRecord,
  type SectionRecord,
  type TicketTypeRecord,
} from "@/components/events/event-types";

type LifecycleRequest = {
  id: string;
  kind: "CANCEL_EVENT" | "STOP_SALES";
  status: string;
  reason: string;
  ticketTypeId?: string | null;
  ticketTypeName?: string;
};

type Detail = {
  event: EventRecord;
  ticketTypes: TicketTypeRecord[];
  sections: SectionRecord[];
  seats: SeatRecord[];
  seatMap: SeatMapRecord | null;
  version: number;
  lifecycleRequests?: LifecycleRequest[];
};

type Suggestion = { field: string; value: string; confidence: string };

function asList<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function EventEditor({ eventId }: { eventId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [ticketName, setTicketName] = useState("Reguler");
  const [price, setPrice] = useState("150000");
  const [quota, setQuota] = useState("50");
  const [saleStart, setSaleStart] = useState("");
  const [saleEnd, setSaleEnd] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [sectionTicket, setSectionTicket] = useState("");
  const [seatLabels, setSeatLabels] = useState("");
  const [altText, setAltText] = useState("");
  const [legend, setLegend] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ tone: "success" | "error"; title: string; body: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [stopReason, setStopReason] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`/api/organizer/events/${eventId}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(readApiError(body, "Event tidak ditemukan."));
          setLoading(false);
          return;
        }
        const payload = body.data as Detail;
        setDetail({
          ...payload,
          ticketTypes: asList(payload.ticketTypes),
          sections: asList(payload.sections),
          seats: asList(payload.seats),
          lifecycleRequests: asList(payload.lifecycleRequests),
        });
        setError("");
        setLoading(false);
      })
      .catch(() => {
        setError("Tidak dapat terhubung ke layanan.");
        setLoading(false);
      });
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!detail?.event || saleStart || saleEnd) return;
    const tz = detail.event.timezone;
    try {
      const eventStart = utcIsoToNaiveLocal(detail.event.startsAt, tz);
      const now = utcIsoToNaiveLocal(new Date().toISOString(), tz);
      setSaleStart(now < eventStart ? now : eventStart);
      setSaleEnd(eventStart);
    } catch {
      /* keep empty until user fills */
    }
  }, [detail, saleEnd, saleStart]);

  async function mutate(path: string, method: string, body?: unknown, success?: { title: string; body: string }) {
    setError("");
    const res = await apiFetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 204) {
      setError(readApiError(payload, "Aksi gagal."));
      setToast({ tone: "error", title: "Gagal", body: readApiError(payload, "Aksi gagal.") });
      return false;
    }
    setToast({
      tone: "success",
      title: success?.title || "Berhasil",
      body: success?.body || "Perubahan disimpan.",
    });
    load();
    return true;
  }

  async function requestStopSales(ticketId: string) {
    if (stopReason.trim().length < 10) {
      setToast({ tone: "error", title: "Gagal", body: "Alasan hentikan penjualan wajib minimal 10 karakter, lalu admin akan mengonfirmasi." });
      return;
    }
    await mutate(
      `/api/organizer/events/${eventId}/ticket-types/${ticketId}/stop-sales`,
      "POST",
      { reason: stopReason },
      { title: "Pengajuan terkirim", body: "Hentikan penjualan menunggu konfirmasi admin." }
    );
  }

  async function requestCancel() {
    if (cancelReason.trim().length < 10) {
      setToast({ tone: "error", title: "Gagal", body: "Alasan pembatalan wajib minimal 10 karakter, lalu admin akan mengonfirmasi." });
      return;
    }
    await mutate(
      `/api/organizer/events/${eventId}/cancel`,
      "POST",
      { reason: cancelReason },
      { title: "Pengajuan terkirim", body: "Pembatalan event menunggu konfirmasi admin." }
    );
  }

  if (loading && !detail) {
    return <p role="status">Memuat event…</p>;
  }
  if (!detail) {
    return (
      <div>
        <p>Event tidak dapat dimuat.</p>
        {error ? (
          <FloatingAlert tone="error" title="Gagal" onClose={() => setError("")}>
            {error}
          </FloatingAlert>
        ) : null}
      </div>
    );
  }

  const current = detail;
  const e = current.event;
  const locked = e.status === "PENDING_REVIEW" || e.status === "CANCELLED" || e.status === "COMPLETED";
  const canEditDetails = e.status === "DRAFT" || e.status === "REJECTED" || e.status === "PUBLISHED";
  const canAuthorTickets = e.status === "DRAFT" || e.status === "REJECTED";
  const pendingReqs = (current.lifecycleRequests || []).filter((r) => r.status === "PENDING");
  const pendingCancel = pendingReqs.some((r) => r.kind === "CANCEL_EVENT");
  const pendingStop = (ticketId: string) => pendingReqs.some((r) => r.kind === "STOP_SALES" && r.ticketTypeId === ticketId);
  const tz = e.timezone;
  const basePath = `/dashboard/event/${eventId}`;

  async function addTicket() {
    const priceRupiah = Number(price);
    const q = Number(quota);
    if (!Number.isInteger(priceRupiah) || !Number.isInteger(q)) {
      setError("Harga dan kuota harus bilangan bulat.");
      setToast({ tone: "error", title: "Gagal", body: "Harga dan kuota harus bilangan bulat." });
      return;
    }
    let saleStartsAt = "";
    let saleEndsAt = "";
    try {
      saleStartsAt = naiveLocalToUtcIso(saleStart, tz);
      saleEndsAt = naiveLocalToUtcIso(saleEnd, tz);
    } catch {
      setToast({ tone: "error", title: "Gagal", body: "Waktu penjualan tidak valid." });
      return;
    }
    const start = new Date(saleStartsAt);
    const end = new Date(saleEndsAt);
    const eventStart = new Date(e.startsAt);
    if (!(start < end)) {
      setToast({ tone: "error", title: "Gagal", body: "Selesai jual harus setelah mulai jual." });
      return;
    }
    if (end > eventStart) {
      setToast({ tone: "error", title: "Gagal", body: "Penjualan harus berakhir sebelum event dimulai." });
      return;
    }
    await mutate(`/api/organizer/events/${eventId}/ticket-types`, "POST", {
      name: ticketName,
      priceRupiah,
      quota: q,
      maxPerAccount: q,
      saleStartsAt,
      saleEndsAt,
      sortOrder: current.ticketTypes.length,
    });
  }

  async function submit() {
    const path = e.status === "REJECTED" ? `/api/organizer/events/${eventId}/resubmit` : `/api/organizer/events/${eventId}/submit`;
    await mutate(path, "POST", { expectedVersion: e.version }, { title: "Berhasil", body: "Event diajukan dan menunggu moderasi." });
  }

  async function uploadImage() {
    await mutate(`/api/organizer/events/${eventId}/images/upload-intents`, "POST", {
      fileName: "poster.png",
      mimeType: "image/png",
      byteSize: 12,
      altText: "Gambar utama event",
    });
  }

  async function saveSections() {
    const sections = [...asList(current.sections)];
    if (sectionName && sectionTicket) {
      sections.push({ id: "", eventId, ticketTypeId: sectionTicket, name: sectionName, sortOrder: sections.length });
    }
    await mutate(`/api/organizer/events/${eventId}/sections`, "PUT", {
      expectedVersion: e.version,
      sections,
    });
  }

  async function saveSeats() {
    const labels = seatLabels.split(",").map((s) => s.trim()).filter(Boolean);
    const sectionId = asList(current.sections)[0]?.id;
    if (!sectionId) {
      setError("Simpan zona terlebih dahulu.");
      setToast({ tone: "error", title: "Gagal", body: "Simpan zona terlebih dahulu." });
      return;
    }
    await mutate(`/api/organizer/events/${eventId}/seats`, "PUT", {
      expectedVersion: e.version,
      seats: labels.map((label) => ({ sectionId, label })),
    });
  }

  async function saveSeatMap() {
    await mutate(`/api/organizer/events/${eventId}/seat-map`, "POST", {
      expectedVersion: e.version,
      altText,
      legend,
    });
  }

  async function suggestPoster(file: File) {
    setError("");
    const csrf = await getCsrfToken();
    const form = new FormData();
    form.set("expectedEventVersion", String(e.version));
    form.set("poster", file);
    const res = await fetch(`/api/organizer/events/${eventId}/ai/poster-suggestions`, {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": csrf },
      body: form,
    });
    const payload = (await res.json().catch(() => ({}))) as ApiError & { data?: { suggestions?: Suggestion[] } };
    if (!res.ok) {
      setToast({ tone: "error", title: "Gagal", body: readApiError(payload, "Saran poster belum tersedia. Isi formulir secara manual.") });
      return;
    }
    setSuggestions(payload.data?.suggestions || []);
    setToast({ tone: "success", title: "Berhasil", body: "Saran belum disimpan. Pilih field lalu simpan draf." });
  }

  const applySelected = suggestions.filter((s) => selected[s.field]);

  return (
    <div className="space-y-8">
      <p>
        Status: <span aria-label={STATUS_LABEL[e.status]}>{STATUS_LABEL[e.status]}</span>
        {" · "}
        {MODE_LABEL[e.inventoryMode]}
        {" · "}
        Diperbarui <time dateTime={e.startsAt}>{formatDateTime(current.event.startsAt, tz)}</time>
      </p>
      {e.status === "PENDING_REVIEW" ? <Alert tone="info" title="Menunggu moderasi">Draf terkunci sampai keputusan admin.</Alert> : null}
      {e.status === "REJECTED" && e.moderationReason ? <Alert tone="error" title="Ditolak">{e.moderationReason}</Alert> : null}
      {e.status === "PUBLISHED" ? <Alert tone="success" title="Terbit">Event tampil di katalog. Anda masih dapat mengubah data event serta harga dan kuota tiket.</Alert> : null}

      <p className="flex flex-wrap gap-4">
        <a className="text-gold-700 underline-offset-2 hover:underline" href={`${basePath}/preview`}>Pratinjau privat</a>
        <a className="text-gold-700 underline-offset-2 hover:underline" href={`${basePath}/staff`}>Kelola petugas</a>
        <a className="text-gold-700 underline-offset-2 hover:underline" href={`${basePath}/scanner`}>Scanner check-in</a>
        <a className="text-gold-700 underline-offset-2 hover:underline" href={`${basePath}/check-in-attempts`}>Riwayat check-in</a>
      </p>

      <EventForm key={e.version} initial={e} readOnly={!canEditDetails} lockInventory={e.status !== "DRAFT"} onSaved={load} />

      <section className="space-y-4">
        <h2 className="font-display text-2xl text-ink">Jenis tiket</h2>
        <ul className="space-y-3">
          {current.ticketTypes.map((t) => (
            <TicketTypeEditor
              key={`${t.id}-${t.version}`}
              ticket={t}
              timezone={tz}
              canEdit={canEditDetails}
              onSave={async (body) => mutate(`/api/organizer/events/${eventId}/ticket-types/${t.id}`, "PATCH", body)}
              stopSales={
                e.status === "PUBLISHED" && !t.salesStoppedAt && !pendingStop(t.id)
                  ? () => void requestStopSales(t.id)
                  : undefined
              }
              stopPending={pendingStop(t.id)}
            />
          ))}
        </ul>
        {canAuthorTickets ? (
          <FormSection title="Tambah jenis tiket" description="Selesai jual harus setelah mulai jual, dan sebelum event dimulai.">
            <Input label="Nama jenis" name="ticketName" value={ticketName} onChange={(ev) => setTicketName(ev.target.value)} />
            <Input label="Harga (Rupiah, integer)" name="priceRupiah" inputMode="numeric" value={price} onChange={(ev) => setPrice(ev.target.value)} />
            <Input label="Kuota" name="quota" inputMode="numeric" value={quota} onChange={(ev) => setQuota(ev.target.value)} />
            <Input label="Mulai jual" name="saleStartsAt" type="datetime-local" value={saleStart} onChange={(ev) => setSaleStart(ev.target.value)} />
            <Input label="Selesai jual" name="saleEndsAt" type="datetime-local" value={saleEnd} onChange={(ev) => setSaleEnd(ev.target.value)} />
            <FormFieldWide>
              <Button type="button" onClick={addTicket}>Tambah jenis tiket</Button>
            </FormFieldWide>
          </FormSection>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-ink">Gambar utama</h2>
        <p>Gambar belum tersedia. Unggahan object storage menunggu keputusan provider.</p>
        {locked ? null : <Button type="button" onClick={uploadImage}>Coba unggah (placeholder)</Button>}
      </section>

      {e.inventoryMode !== "GENERAL_ADMISSION" && canAuthorTickets ? (
        <FormSection title="Zona dan denah">
          <Input label="Nama zona" name="sectionName" value={sectionName} onChange={(ev) => setSectionName(ev.target.value)} />
          <Select id="sectionTicket" label="Jenis tiket zona" value={sectionTicket} onChange={(ev) => setSectionTicket(ev.target.value)}>
            <option value="">Pilih jenis tiket</option>
            {current.ticketTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
          <FormFieldWide>
            <Button type="button" onClick={saveSections}>Simpan zona</Button>
          </FormFieldWide>
          {e.inventoryMode === "RESERVED_SEATING" ? (
            <>
              <FormFieldWide>
                <Input label="Label kursi (pisahkan koma)" name="seats" value={seatLabels} onChange={(ev) => setSeatLabels(ev.target.value)} />
              </FormFieldWide>
              <Button type="button" onClick={saveSeats}>Simpan kursi</Button>
              <Input label="Teks alternatif denah" name="altText" value={altText} onChange={(ev) => setAltText(ev.target.value)} />
              <Input label="Legenda denah" name="legend" value={legend} onChange={(ev) => setLegend(ev.target.value)} />
              <FormFieldWide>
                <Button type="button" onClick={saveSeatMap}>Simpan meta denah (placeholder)</Button>
              </FormFieldWide>
            </>
          ) : null}
        </FormSection>
      ) : null}

      {canAuthorTickets ? (
        <section className="space-y-3">
          <h2 className="font-display text-2xl text-ink">Saran dari poster</h2>
          <p>AI tidak menyimpan draf. Pilih saran, lalu simpan lewat formulir di atas.</p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Unggah poster sementara"
            onChange={(ev) => {
              const file = ev.target.files?.[0];
              if (file) void suggestPoster(file);
            }}
          />
          {suggestions.length ? (
            <ul className="space-y-2">
              {suggestions.map((s) => (
                <li key={s.field}>
                  <label className="flex min-h-11 items-center gap-2">
                    <input type="checkbox" checked={Boolean(selected[s.field])} onChange={(ev) => setSelected((cur) => ({ ...cur, [s.field]: ev.target.checked }))} />
                    {s.field}: {s.value} ({s.confidence})
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
          {applySelected.length ? (
            <Alert tone="info" title="Terapkan yang dipilih">
              Salin nilai terpilih ke formulir secara manual, lalu tekan Simpan draf. Submit tidak dijalankan otomatis.
            </Alert>
          ) : null}
        </section>
      ) : null}

      {canAuthorTickets ? (
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={submit}>{e.status === "REJECTED" ? "Ajukan ulang" : "Ajukan untuk ditinjau"}</Button>
        </div>
      ) : null}
      {e.status === "PUBLISHED" || e.status === "PENDING_REVIEW" || e.status === "REJECTED" ? (
        <section className="grid max-w-xl gap-3">
          <h2 className="font-display text-2xl text-ink">Lifecycle</h2>
          {e.status === "PUBLISHED" ? (
            <>
              <Input label="Alasan hentikan penjualan (min. 10 karakter, dikirim ke admin)" name="stopReason" value={stopReason} onChange={(ev) => setStopReason(ev.target.value)} />
              <Button type="button" onClick={() => void mutate(`/api/organizer/events/${eventId}/complete`, "POST", { expectedVersion: e.version }, { title: "Berhasil", body: "Event ditandai selesai." })}>Tandai selesai</Button>
            </>
          ) : null}
          <Input label="Alasan pembatalan (min. 10 karakter)" name="cancelReason" value={cancelReason} onChange={(ev) => setCancelReason(ev.target.value)} />
          {pendingCancel ? <Alert tone="info" title="Menunggu admin">Pengajuan pembatalan sudah dikirim dan menunggu konfirmasi admin.</Alert> : null}
          <Button type="button" disabled={pendingCancel} onClick={() => void requestCancel()}>Ajukan pembatalan event</Button>
        </section>
      ) : null}
      {toast ? (
        <FloatingAlert
          tone={toast.tone}
          title={toast.title}
          onClose={() => setToast(null)}
        >
          {toast.body}
        </FloatingAlert>
      ) : null}
    </div>
  );
}

function TicketTypeEditor({
  ticket,
  timezone,
  canEdit,
  onSave,
  stopSales,
  stopPending,
}: {
  ticket: TicketTypeRecord;
  timezone: string;
  canEdit: boolean;
  onSave: (body: unknown) => Promise<boolean>;
  stopSales?: () => void;
  stopPending?: boolean;
}) {
  const paid = ticket.paidQuantity ?? 0;
  const reserved = ticket.reservedQuantity ?? 0;
  const minQuota = paid + reserved;
  const [price, setPrice] = useState(String(ticket.priceRupiah));
  const [quota, setQuota] = useState(String(ticket.quota));
  const [localError, setLocalError] = useState("");

  async function save() {
    setLocalError("");
    const priceRupiah = Number(price);
    const q = Number(quota);
    if (!Number.isInteger(priceRupiah) || priceRupiah < 0) {
      setLocalError("Harga harus bilangan bulat Rupiah.");
      return;
    }
    if (!Number.isInteger(q) || q < minQuota) {
      setLocalError(
        minQuota > 0
          ? `Kuota minimal ${minQuota} (terjual ${paid}${reserved ? `, dipesan ${reserved}` : ""}).`
          : "Kuota harus bilangan bulat positif."
      );
      return;
    }
    await onSave({
      name: ticket.name,
      description: ticket.description || "",
      priceRupiah,
      quota: q,
      maxPerAccount: ticket.maxPerAccount > 0 ? ticket.maxPerAccount : q,
      saleStartsAt: ticket.saleStartsAt,
      saleEndsAt: ticket.saleEndsAt,
      sortOrder: ticket.sortOrder,
      expectedVersion: ticket.version,
    });
  }

  return (
    <li className="rounded-md border border-stone-200 p-4">
      <p className="font-medium text-ink">{ticket.name}</p>
      <p className="mt-1 text-sm text-ink/65">
        Terjual {paid}
        {reserved > 0 ? ` · Dipesan ${reserved}` : ""}
        {typeof ticket.remaining === "number" ? ` · Sisa ${ticket.remaining}` : ""}
        {ticket.salesStoppedAt ? " · penjualan dihentikan" : ""}
      </p>
      {canEdit ? (
        <div className="mt-3 grid max-w-xl gap-3 sm:grid-cols-2">
          <Input label="Harga (Rupiah)" name={`price-${ticket.id}`} inputMode="numeric" value={price} onChange={(ev) => setPrice(ev.target.value)} />
          <Input
            label={`Kuota (min. ${minQuota})`}
            name={`quota-${ticket.id}`}
            inputMode="numeric"
            value={quota}
            onChange={(ev) => setQuota(ev.target.value)}
          />
          {localError ? (
            <FloatingAlert tone="error" title="Gagal" onClose={() => setLocalError("")}>
              {localError}
            </FloatingAlert>
          ) : null}
          <div className="sm:col-span-2 flex flex-wrap gap-3">
            <Button type="button" onClick={() => void save()}>Simpan jenis tiket</Button>
            {stopSales ? (
              <Button type="button" onClick={stopSales}>
                Ajukan hentikan penjualan
              </Button>
            ) : null}
            {stopPending ? <p className="text-sm text-ink/70">Pengajuan hentikan penjualan menunggu konfirmasi admin.</p> : null}
          </div>
        </div>
      ) : (
        <p className="mt-2">
          {formatRupiah(ticket.priceRupiah)} · kuota {ticket.quota}
        </p>
      )}
      <p className="mt-2 text-xs text-ink/50">
        Jual {formatDateTime(ticket.saleStartsAt, timezone)} – {formatDateTime(ticket.saleEndsAt, timezone)}
      </p>
    </li>
  );
}
