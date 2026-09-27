"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, getCsrfToken, readApiError, type ApiError } from "@/lib/api";
import { eventHasEnded, eventLifecycle, formatDateTime, formatRupiah, naiveLocalToUtcIso, utcIsoToNaiveLocal } from "@/lib/format";
import { reservedSeatsFromTypes, seatPrefix, seatPreview } from "@/lib/seats";
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

export function EventEditor({ eventId, readOnly = false }: { eventId: string; readOnly?: boolean }) {
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
  const [altText, setAltText] = useState("");
  const [legend, setLegend] = useState("");
  const [mapFile, setMapFile] = useState<File | null>(null);
  const [mapPreview, setMapPreview] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ tone: "success" | "error"; title: string; body: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [stopReason, setStopReason] = useState("");

  const load = useCallback(async (initial = false): Promise<Detail | null> => {
    if (initial) setLoading(true);
    try {
      const res = await apiFetch(`/api/organizer/events/${eventId}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(readApiError(body, "Event tidak ditemukan."));
        if (initial) setLoading(false);
        return null;
      }
      const payload = body.data as Detail;
      const next: Detail = {
        ...payload,
        ticketTypes: asList(payload.ticketTypes),
        sections: asList(payload.sections),
        seats: asList(payload.seats),
        lifecycleRequests: asList(payload.lifecycleRequests),
      };
      setDetail(next);
      setError("");
      if (initial) setLoading(false);
      return next;
    } catch {
      setError("Tidak dapat terhubung ke layanan.");
      if (initial) setLoading(false);
      return null;
    }
  }, [eventId]);

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    const map = detail?.seatMap;
    if (!map) return;
    setAltText((cur) => cur || map.altText || "");
    setLegend((cur) => cur || map.legend || "");
    setMapPreview((cur) => cur || map.url || "");
  }, [detail?.seatMap]);

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

  async function mutate(path: string, method: string, body?: unknown, success?: { title: string; body: string } | null) {
    if (readOnly) {
      setError("Akun ditangguhkan. Data lama tetap terlihat, perubahan baru ditahan.");
      return false;
    }
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
    if (success !== null) {
      setToast({
        tone: "success",
        title: success?.title || "Berhasil",
        body: success?.body || "Perubahan disimpan.",
      });
    }
    await load();
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
  const canEditDetails = !readOnly && (e.status === "DRAFT" || e.status === "REJECTED" || e.status === "PUBLISHED");
  const canAuthorTickets = !readOnly && (e.status === "DRAFT" || e.status === "REJECTED");
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

  async function applyPosterSuggestions() {
    const picks = suggestions.filter((s) => selected[s.field] && s.field !== "ticketTypes");
    if (!picks.length) {
      setToast({ tone: "error", title: "Belum ada pilihan", body: "Centang saran yang ingin disimpan ke draf." });
      return;
    }
    const body: Record<string, unknown> = {
      title: e.title,
      description: e.description,
      category: e.category,
      venueName: e.venueName,
      addressLine: e.addressLine,
      city: e.city,
      province: e.province,
      latitude: e.latitude,
      longitude: e.longitude,
      tags: e.tags || [],
      galleryUrls: e.galleryUrls || [],
      timezone: e.timezone,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      terms: e.terms,
      contactEmail: e.contactEmail,
      contactPhone: e.contactPhone || "",
      inventoryMode: e.inventoryMode,
      expectedVersion: e.version,
    };
    for (const s of picks) {
      body[s.field] = s.value;
    }
    await mutate(`/api/organizer/events/${eventId}`, "PATCH", body, {
      title: "Draf diperbarui",
      body: "Saran terpilih disimpan. Periksa formulir di atas, lalu ajukan jika sudah lengkap.",
    });
  }

  async function syncReservedSeats(snapshot: Detail) {
    const seats = reservedSeatsFromTypes(snapshot.ticketTypes, snapshot.sections);
    const ok = await mutate(
      `/api/organizer/events/${eventId}/seats`,
      "PUT",
      { expectedVersion: snapshot.event.version, seats },
      {
        title: "Kursi disiapkan",
        body: "Label mengikuti urutan jenis tiket: A1… sesuai kuota, jenis berikutnya B1…, dan seterusnya.",
      },
    );
    if (!ok) return;
  }

  async function saveSections() {
    if (!sectionName.trim() || !sectionTicket) {
      setToast({ tone: "error", title: "Lengkapi zona", body: "Isi nama zona dan jenis tiket." });
      return;
    }
    const sections = [
      ...asList(current.sections),
      { id: "", eventId, ticketTypeId: sectionTicket, name: sectionName.trim(), sortOrder: asList(current.sections).length },
    ];
    const ok = await mutate(
      `/api/organizer/events/${eventId}/sections`,
      "PUT",
      { expectedVersion: e.version, sections },
      e.inventoryMode === "RESERVED_SEATING" ? null : { title: "Zona disimpan", body: "Zona tiket disimpan." },
    );
    if (!ok) return;
    setSectionName("");
    if (e.inventoryMode === "RESERVED_SEATING") {
      const fresh = await load();
      if (fresh) await syncReservedSeats(fresh);
    }
  }

  async function saveSeatMap() {
    if (readOnly) {
      setError("Akun ditangguhkan. Data lama tetap terlihat, perubahan baru ditahan.");
      return;
    }
    const nextAlt = altText.trim() || `Denah venue ${e.title}`;
    const nextLegend =
      legend.trim() ||
      (e.inventoryMode === "RESERVED_SEATING"
        ? "Huruf menandai jenis tiket. Angka adalah nomor kursi. Panggung biasanya di sisi atas denah."
        : "Warna atau label pada denah menandai zona tiket.");
    if (!mapFile && !current.seatMap?.url) {
      setToast({ tone: "error", title: "Gambar denah wajib", body: "Pilih berkas JPEG, PNG, atau WebP (maks. 5 MB)." });
      return;
    }
    setError("");
    const csrf = await getCsrfToken();
    const form = new FormData();
    form.set("expectedVersion", String(e.version));
    form.set("altText", nextAlt);
    form.set("legend", nextLegend);
    if (mapFile) form.set("image", mapFile);
    const res = await fetch(`/api/organizer/events/${eventId}/seat-map`, {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": csrf },
      body: form,
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setToast({ tone: "error", title: "Gagal", body: readApiError(payload, "Unggah denah gagal.") });
      return;
    }
    setAltText(nextAlt);
    setLegend(nextLegend);
    setMapFile(null);
    setToast({ tone: "success", title: "Denah disimpan", body: "Gambar denah tampil di detail event untuk pembeli." });
    await load();
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

  const life = eventLifecycle(e.status, e.startsAt, e.endsAt);
  return (
    <div className="space-y-8">
      <p>
        Status: <span aria-label={life.label}>{life.label}</span>
        {life.key === "ended" ? ` · ${life.hint}` : ""}
        {" · "}
        {MODE_LABEL[e.inventoryMode]}
        {" · "}
        Diperbarui <time dateTime={e.startsAt}>{formatDateTime(current.event.startsAt, tz)}</time>
      </p>
      {readOnly ? (
        <Alert tone="warning" title="Akun ditangguhkan">
          Data event ini tetap tersimpan. Perubahan, pengajuan, dan penjualan baru ditahan sampai admin memulihkan akun.
        </Alert>
      ) : null}
      {e.status === "PENDING_REVIEW" ? <Alert tone="info" title="Menunggu moderasi">Draf terkunci sampai keputusan admin.</Alert> : null}
      {e.status === "REJECTED" && e.moderationReason ? <Alert tone="error" title="Ditolak">{e.moderationReason}</Alert> : null}
      {e.status === "COMPLETED" || (e.status === "PUBLISHED" && eventHasEnded(e.endsAt, e.startsAt)) ? (
        <Alert tone="info" title="Event telah selesai">
          Jadwal event sudah berakhir. Penjualan dan check-in mengikuti waktu event, bukan hanya status Terbit.
        </Alert>
      ) : e.status === "PUBLISHED" ? (
        <Alert tone="success" title="Terbit">Event tampil di katalog. Anda masih dapat mengubah data event serta harga dan kuota tiket.</Alert>
      ) : null}

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
              onDelete={
                canAuthorTickets && (t.paidQuantity ?? 0) + (t.reservedQuantity ?? 0) === 0
                  ? async () => {
                      if (!window.confirm(`Hapus jenis tiket “${t.name}”? Zona dan kursi yang terhubung ikut dihapus.`)) return false;
                      return mutate(`/api/organizer/events/${eventId}/ticket-types/${t.id}`, "DELETE", { expectedVersion: t.version }, { title: "Dihapus", body: "Jenis tiket dihapus dari draf." });
                    }
                  : undefined
              }
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
              <Button type="button" className="w-auto" onClick={addTicket}>Tambah jenis tiket</Button>
            </FormFieldWide>
          </FormSection>
        ) : null}
      </section>

      <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="font-display text-2xl text-ink">Sampul katalog</h2>
        <p className="max-w-2xl text-sm text-ink/65">
          Foto pertama di galeri formulir di atas menjadi gambar utama di katalog. Unggah JPEG, PNG, atau WebP di bagian Galeri — bukan tombol terpisah di sini.
        </p>
        {e.galleryUrls?.[0] ? (
          <img src={e.galleryUrls[0]} alt={`Sampul ${e.title}`} className="max-h-48 rounded-2xl border border-stone-200 object-cover" />
        ) : (
          <p className="text-sm text-ink/55">Belum ada sampul. Gulir ke atas, unggah foto di Galeri, lalu simpan draf.</p>
        )}
      </section>

      {e.inventoryMode !== "GENERAL_ADMISSION" ? (
        <FormSection
          columns={1}
          title={e.inventoryMode === "RESERVED_SEATING" ? "Zona dan kursi bernomor" : "Zona tiket"}
          description={
            e.inventoryMode === "RESERVED_SEATING"
              ? "Satu zona per jenis tiket. Kursi dibuat otomatis: jenis tiket pertama A1–A{kuota}, jenis berikutnya B1–B{kuota}. Pembeli memilih kursi yang masih tersedia."
              : "Setiap zona terhubung ke satu jenis tiket. Pembeli memilih zona dan melihat sisa kuota."
          }
        >
          {asList(current.sections).length === 0 ? (
            <p className="text-sm text-ink/55">Belum ada zona. Tambah jenis tiket dulu, lalu simpan zona.</p>
          ) : (
            <ul className="space-y-2">
              {asList(current.sections).map((sec) => {
                const type = current.ticketTypes.find((t) => t.id === sec.ticketTypeId);
                const typeIndex = current.ticketTypes.findIndex((t) => t.id === sec.ticketTypeId);
                const prefix = typeIndex >= 0 ? seatPrefix(typeIndex) : "?";
                const labels = asList(current.seats)
                  .filter((s) => s.sectionId === sec.id)
                  .map((s) => s.label);
                const quota = type?.quota ?? 0;
                return (
                  <li key={sec.id} className="rounded-xl border border-stone-100 bg-[#f7f8fd] px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{sec.name}</p>
                        <p className="mt-0.5 text-sm text-ink/55">
                          {type?.name || "Jenis tiket"}
                          {e.inventoryMode === "RESERVED_SEATING"
                            ? ` · ${prefix}1–${prefix}${quota || "?"} · ${labels.length} kursi`
                            : ` · kuota ${quota}`}
                        </p>
                        {e.inventoryMode === "RESERVED_SEATING" ? (
                          labels.length ? (
                            <p className="mt-2 font-mono text-xs leading-relaxed text-ink/70">{seatPreview(labels)}</p>
                          ) : (
                            <p className="mt-2 text-xs text-ink/55">
                              Kursi jenis tiket ini sudah dipasang di zona lain, atau kuota belum diisi. Satu jenis tiket hanya punya satu deret kursi.
                            </p>
                          )
                        ) : null}
                      </div>
                      {canAuthorTickets ? (
                        <button
                          type="button"
                          className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-medium text-red-700 hover:bg-red-50"
                          onClick={() => {
                            if (!window.confirm(`Hapus zona “${sec.name}”? Kursi di zona ini ikut dihapus.`)) return;
                            const next = asList(current.sections).filter((s) => s.id !== sec.id);
                            void (async () => {
                              const ok = await mutate(
                                `/api/organizer/events/${eventId}/sections`,
                                "PUT",
                                { expectedVersion: e.version, sections: next },
                                e.inventoryMode === "RESERVED_SEATING" ? null : { title: "Zona dihapus", body: "Zona dihapus dari draf." },
                              );
                              if (!ok || e.inventoryMode !== "RESERVED_SEATING") return;
                              const fresh = await load();
                              if (fresh) await syncReservedSeats(fresh);
                            })();
                          }}
                        >
                          Hapus
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {canAuthorTickets ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Nama zona" name="sectionName" value={sectionName} onChange={(ev) => setSectionName(ev.target.value)} hint="Contoh: Tribune Biasa atau VIP" />
              <Select id="sectionTicket" label="Jenis tiket zona" value={sectionTicket} onChange={(ev) => setSectionTicket(ev.target.value)}>
                <option value="">Pilih jenis tiket</option>
                {current.ticketTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} · kuota {t.quota}</option>
                ))}
              </Select>
              <div className="sm:col-span-2 flex flex-wrap gap-2">
                <Button type="button" className="w-auto justify-self-start" onClick={() => void saveSections()}>
                  Simpan zona
                </Button>
                {e.inventoryMode === "RESERVED_SEATING" && asList(current.sections).length > 0 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-auto"
                    onClick={() => void syncReservedSeats(current)}
                  >
                    Perbarui kursi sesuai kuota
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="rounded-xl border border-stone-100 p-4">
              <h3 className="text-sm font-semibold text-ink">Denah venue</h3>
              <p className="mt-1 text-sm text-ink/60">
                Unggah denah statis (bukan peta klik). Pembeli melihat gambar ini sebagai petunjuk zona atau kursi. JPEG, PNG, atau WebP, maks. 5 MB.
                {e.inventoryMode === "RESERVED_SEATING" ? " Wajib sebelum event diajukan." : " Opsional untuk mode zona."}
              </p>
              {(mapPreview || current.seatMap?.url) ? (
                <img
                  src={mapPreview || current.seatMap?.url}
                  alt={altText || `Denah ${e.title}`}
                  className="mt-3 max-h-64 w-full rounded-xl border border-stone-200 object-contain bg-[#f7f8fd]"
                />
              ) : (
                <p className="mt-3 text-sm text-ink/45">Belum ada gambar denah.</p>
              )}
              {canAuthorTickets ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-ink sm:col-span-2">
                    File denah
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="mt-2 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-full file:border file:border-stone-300 file:bg-white file:px-4 file:text-sm"
                      onChange={(ev) => {
                        const file = ev.target.files?.[0] || null;
                        setMapFile(file);
                        if (file) setMapPreview(URL.createObjectURL(file));
                      }}
                    />
                  </label>
                  <Input
                    label="Teks alternatif"
                    name="altText"
                    value={altText}
                    onChange={(ev) => setAltText(ev.target.value)}
                    hint="Jelaskan denah untuk pembaca layar, min. 3 karakter."
                  />
                  <Input
                    label="Legenda"
                    name="legend"
                    value={legend}
                    onChange={(ev) => setLegend(ev.target.value)}
                    hint="Contoh: A = Reguler, B = VIP. Panggung di atas."
                  />
                  <div className="sm:col-span-2">
                    <Button type="button" className="w-auto" onClick={() => void saveSeatMap()}>
                      Simpan denah
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
        </FormSection>
      ) : null}

      {canAuthorTickets ? (
        <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="font-display text-2xl text-ink">Isi otomatis dari poster</h2>
          <p className="max-w-2xl text-sm text-ink/65">
            Unggah poster untuk mendapat saran judul, kategori, atau lokasi. AI tidak menyimpan draf dan tidak mengajukan event. Centang saran, lalu simpan ke draf. Jika saran kosong, isi formulir secara manual.
          </p>
          <label className="block text-sm font-medium text-ink">
            File poster
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="mt-2 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-full file:border file:border-stone-300 file:bg-white file:px-4 file:text-sm"
              onChange={(ev) => {
                const file = ev.target.files?.[0];
                if (file) void suggestPoster(file);
              }}
            />
          </label>
          {suggestions.length ? (
            <ul className="space-y-2">
              {suggestions.map((s) => (
                <li key={s.field}>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" checked={Boolean(selected[s.field])} onChange={(ev) => setSelected((cur) => ({ ...cur, [s.field]: ev.target.checked }))} />
                    <span>
                      <span className="font-medium">{s.field}</span>: {s.value}
                      <span className="text-ink/45"> · keyakinan {s.confidence}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
          {applySelected.length ? (
            <Button type="button" variant="secondary" onClick={() => void applyPosterSuggestions()}>
              Simpan saran terpilih ke draf
            </Button>
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
  onDelete,
  stopSales,
  stopPending,
}: {
  ticket: TicketTypeRecord;
  timezone: string;
  canEdit: boolean;
  onSave: (body: unknown) => Promise<boolean>;
  onDelete?: () => Promise<boolean | void>;
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
            {onDelete ? (
              <Button type="button" variant="danger" onClick={() => void onDelete()}>
                Hapus
              </Button>
            ) : null}
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
