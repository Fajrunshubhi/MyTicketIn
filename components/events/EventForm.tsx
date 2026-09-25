"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { apiFetch, readApiError, type ApiError } from "@/lib/api";
import { naiveLocalToUtcIso, utcIsoToNaiveLocal } from "@/lib/format";
import { eventMapQuery, googleMapsEmbedUrl, googleMapsSearchUrl } from "@/lib/maps";
import { FloatingAlert } from "@/components/ui/FloatingAlert";
import { Button } from "@/components/ui/Button";
import { FormFieldWide, FormSection } from "@/components/ui/FormSection";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { TIMEZONES, type EventRecord, type InventoryMode } from "@/components/events/event-types";

type Values = {
  title: string;
  description: string;
  category: string;
  venueName: string;
  addressLine: string;
  city: string;
  province: string;
  latitude: string;
  longitude: string;
  tags: string[];
  galleryUrls: string[];
  timezone: string;
  startsAt: string;
  endsAt: string;
  terms: string;
  contactEmail: string;
  contactPhone: string;
  inventoryMode: InventoryMode;
};

const empty: Values = {
  title: "",
  description: "",
  category: "",
  venueName: "",
  addressLine: "",
  city: "",
  province: "",
  latitude: "",
  longitude: "",
  tags: [],
  galleryUrls: [],
  timezone: "Asia/Jakarta",
  startsAt: "",
  endsAt: "",
  terms: "",
  contactEmail: "",
  contactPhone: "",
  inventoryMode: "GENERAL_ADMISSION",
};

function fromRecord(e: EventRecord): Values {
  return {
    title: e.title,
    description: e.description,
    category: e.category,
    venueName: e.venueName,
    addressLine: e.addressLine,
    city: e.city,
    province: e.province,
    latitude: e.latitude != null ? String(e.latitude) : "",
    longitude: e.longitude != null ? String(e.longitude) : "",
    tags: e.tags || [],
    galleryUrls: e.galleryUrls || [],
    timezone: e.timezone,
    startsAt: utcIsoToNaiveLocal(e.startsAt, e.timezone),
    endsAt: utcIsoToNaiveLocal(e.endsAt, e.timezone),
    terms: e.terms,
    contactEmail: e.contactEmail,
    contactPhone: e.contactPhone || "",
    inventoryMode: e.inventoryMode,
  };
}

export function EventForm({
  initial,
  readOnly,
  lockInventory,
  onCreated,
  onSaved,
}: {
  initial?: EventRecord;
  readOnly?: boolean;
  lockInventory?: boolean;
  onCreated?: (id: string) => void;
  onSaved?: () => void;
}) {
  const [values, setValues] = useState<Values>(initial ? fromRecord(initial) : empty);
  const [toast, setToast] = useState<{ tone: "success" | "error"; title: string; body: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
	const [tagDraft, setTagDraft] = useState("");
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  function addTag() {
    const next = tagDraft.trim().toLowerCase().split("_").join("-").split(/\s+/).join("-");
    if (!next) return;
    setValues((cur) => (cur.tags.includes(next) || cur.tags.length >= 8 ? cur : { ...cur, tags: [...cur.tags, next] }));
    setTagDraft("");
  }

  async function addGalleryFiles(files: FileList | null) {
    if (!files || files.length === 0 || readOnly) return;
    setGalleryBusy(true);
    try {
      let urls = values.galleryUrls;
      for (const file of Array.from(files)) {
        if (urls.length >= 8) break;
        const form = new FormData();
        form.set("image", file);
        const res = await apiFetch("/api/organizer/gallery-images", { method: "POST", body: form });
        const payload = (await res.json().catch(() => ({}))) as ApiError & { data?: { url?: string } };
        if (!res.ok || !payload.data?.url) {
          setToast({ tone: "error", title: "Gagal", body: readApiError(payload, "Unggah gambar gagal.") });
          continue;
        }
        if (!urls.includes(payload.data.url)) {
          urls = [...urls, payload.data.url];
        }
      }
      setValues((cur) => ({ ...cur, galleryUrls: urls }));
    } finally {
      setGalleryBusy(false);
    }
  }

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((cur) => ({ ...cur, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setFieldErrors({});
    setLoading(true);
    let startsAt = "";
    let endsAt = "";
    try {
      startsAt = naiveLocalToUtcIso(values.startsAt, values.timezone);
      endsAt = naiveLocalToUtcIso(values.endsAt, values.timezone);
    } catch {
      setLoading(false);
      setToast({ tone: "error", title: "Gagal", body: "Waktu event tidak valid." });
      return;
    }
    if (values.latitude.trim() === "" || values.longitude.trim() === "") {
      setLoading(false);
      setFieldErrors({ latitude: "Koordinat lokasi wajib diisi." });
      setToast({ tone: "error", title: "Gagal", body: "Isi lintang dan bujur venue." });
      return;
    }
    const lat = Number(values.latitude.replace(",", "."));
    const lng = Number(values.longitude.replace(",", "."));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setLoading(false);
      setFieldErrors({ latitude: "Koordinat lokasi wajib diisi." });
      setToast({ tone: "error", title: "Gagal", body: "Isi lintang dan bujur venue." });
      return;
    }
    const payload = {
      ...values,
      latitude: lat,
      longitude: lng,
      tags: values.tags,
      startsAt,
      endsAt,
      contactPhone: values.contactPhone.trim() || undefined,
      expectedVersion: initial?.version,
    };
    const path = initial ? `/api/organizer/events/${initial.id}` : "/api/organizer/events";
    const res = await apiFetch(path, {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as ApiError & { data?: { event?: { id: string } } };
    setLoading(false);
    if (!res.ok) {
      setFieldErrors(body.error?.fieldErrors || {});
      setToast({ tone: "error", title: "Gagal", body: readApiError(body, "Gagal menyimpan event.") });
      return;
    }
    if (!initial && body.data?.event?.id && onCreated) {
      onCreated(body.data.event.id);
      return;
    }
    setToast({ tone: "success", title: "Berhasil", body: "Perubahan event disimpan." });
    onSaved?.();
  }

  const disabled = readOnly || loading;

  return (
    <form onSubmit={onSubmit} className="grid max-w-4xl gap-5">
      {toast ? (
        <FloatingAlert tone={toast.tone} title={toast.title} onClose={() => setToast(null)}>
          {toast.body}
        </FloatingAlert>
      ) : null}
      <fieldset disabled={disabled} className="contents">
        <FormSection title="Informasi event" description="Judul dan deskripsi tampil di katalog publik.">
          <FormFieldWide>
            <Input label="Judul" name="title" value={values.title} onChange={(e) => set("title", e.target.value)} error={fieldErrors.title} required />
          </FormFieldWide>
          <FormFieldWide>
            <label htmlFor="description" className="mb-1 block text-sm font-medium">Deskripsi</label>
            <textarea id="description" name="description" rows={5} className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm" value={values.description} onChange={(e) => set("description", e.target.value)} required />
            {fieldErrors.description ? <p className="mt-1 text-sm text-red-700" role="alert">{fieldErrors.description}</p> : null}
          </FormFieldWide>
          <Input label="Kategori" name="category" value={values.category} onChange={(e) => set("category", e.target.value)} error={fieldErrors.category} required />
        </FormSection>
        <FormSection title="Lokasi" description="Koordinat wajib agar peta dan filter kota akurat.">
          <Input label="Nama venue" name="venueName" value={values.venueName} onChange={(e) => set("venueName", e.target.value)} error={fieldErrors.venueName} required />
          <Input label="Alamat" name="addressLine" value={values.addressLine} onChange={(e) => set("addressLine", e.target.value)} error={fieldErrors.addressLine} required />
          <Input label="Kota" name="city" value={values.city} onChange={(e) => set("city", e.target.value)} error={fieldErrors.city} required />
          <Input label="Provinsi" name="province" value={values.province} onChange={(e) => set("province", e.target.value)} error={fieldErrors.province} required />
          <FormFieldWide>
            <p className="text-sm text-ink/65">
              Buka Google Maps, klik kanan titik venue, lalu salin angka lintang dan bujur.
            </p>
            <a
              className="text-sm font-medium text-gold-800 underline-offset-2 hover:underline"
              href={googleMapsSearchUrl(eventMapQuery({ venueName: values.venueName, addressLine: values.addressLine, city: values.city, province: values.province }))}
              target="_blank"
              rel="noreferrer"
            >
              Cari alamat ini di Google Maps
            </a>
          </FormFieldWide>
          <Input label="Lintang (latitude)" name="latitude" inputMode="decimal" value={values.latitude} onChange={(e) => set("latitude", e.target.value)} error={fieldErrors.latitude} required />
          <Input label="Bujur (longitude)" name="longitude" inputMode="decimal" value={values.longitude} onChange={(e) => set("longitude", e.target.value)} error={fieldErrors.longitude} required />
          {values.latitude.trim() !== "" && values.longitude.trim() !== "" && Number.isFinite(Number(values.latitude.replace(",", "."))) && Number.isFinite(Number(values.longitude.replace(",", "."))) ? (
            <FormFieldWide>
              <iframe
                title="Pratinjau peta venue"
                src={googleMapsEmbedUrl(`${values.latitude.replace(",", ".")},${values.longitude.replace(",", ".")}`)}
                className="h-48 w-full rounded-2xl border border-stone-200"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </FormFieldWide>
          ) : null}
        </FormSection>
        <FormSection title="Pencarian dan galeri">
          <FormFieldWide>
            <label htmlFor="tagDraft" className="mb-1 block text-sm font-medium">Tag pencarian</label>
            <p className="mb-2 text-sm text-ink/65">Maksimal 8 tag. Huruf, angka, dan tanda hubung.</p>
            <div className="flex flex-wrap gap-2">
              {values.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="inline-flex min-h-11 items-center rounded-full border border-stone-200 bg-white px-3 text-sm"
                  onClick={() => setValues((cur) => ({ ...cur, tags: cur.tags.filter((item) => item !== tag) }))}
                  aria-label={`Hapus tag ${tag}`}
                >
                  {tag} ×
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                id="tagDraft"
                className="min-h-11 flex-1 rounded-xl border border-stone-300 bg-white px-3 text-sm"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="contoh: jakarta-events"
                disabled={disabled}
              />
              <Button type="button" variant="secondary" onClick={addTag} disabled={disabled}>
                Tambah
              </Button>
            </div>
            {fieldErrors.tags ? <p className="mt-1 text-sm text-red-700" role="alert">{fieldErrors.tags}</p> : null}
          </FormFieldWide>
          <FormFieldWide>
            <label htmlFor="galleryFiles" className="mb-1 block text-sm font-medium">Galeri gambar</label>
            <p className="mb-2 text-sm text-ink/65">Hingga 8 foto JPEG, PNG, atau WebP, maks. 5 MB.</p>
            <ul className="grid gap-2 sm:grid-cols-4">
              {values.galleryUrls.map((url) => (
                <li key={url} className="relative overflow-hidden rounded-xl border border-stone-200">
                  <img src={url.startsWith("/uploads/") ? "/dummy-events/jazz-1.jpg" : url} alt="" className="h-20 w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-1 top-1 rounded-full bg-white/90 px-2 text-xs"
                    onClick={() => setValues((cur) => ({ ...cur, galleryUrls: cur.galleryUrls.filter((item) => item !== url) }))}
                    aria-label="Hapus gambar"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <input
              id="galleryFiles"
              className="mt-2 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-full file:border file:border-stone-300 file:bg-white file:px-4 file:text-sm file:font-medium"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={disabled || galleryBusy || values.galleryUrls.length >= 8}
              onChange={(e) => {
                void addGalleryFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {fieldErrors.galleryUrls ? <p className="mt-1 text-sm text-red-700" role="alert">{fieldErrors.galleryUrls}</p> : null}
          </FormFieldWide>
        </FormSection>
        <FormSection title="Jadwal">
          <Select id="timezone" label="Zona waktu" value={values.timezone} onChange={(e) => set("timezone", e.target.value)}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </Select>
          <Input label="Mulai" name="startsAt" type="datetime-local" value={values.startsAt} onChange={(e) => set("startsAt", e.target.value)} error={fieldErrors.startsAt} required />
          <Input label="Selesai" name="endsAt" type="datetime-local" value={values.endsAt} onChange={(e) => set("endsAt", e.target.value)} error={fieldErrors.endsAt} required />
        </FormSection>
        <FormSection title="Ketentuan dan inventori">
          <FormFieldWide>
            <label htmlFor="terms" className="mb-1 block text-sm font-medium">Syarat</label>
            <textarea id="terms" name="terms" rows={4} className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm" value={values.terms} onChange={(e) => set("terms", e.target.value)} required />
          </FormFieldWide>
          <Input label="Email kontak" name="contactEmail" type="email" value={values.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} error={fieldErrors.contactEmail} required />
          <Input label="Telepon (opsional)" name="contactPhone" value={values.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} error={fieldErrors.contactPhone} />
          <Select id="inventoryMode" label="Mode inventori" disabled={lockInventory} value={values.inventoryMode} onChange={(e) => set("inventoryMode", e.target.value as InventoryMode)}>
            <option value="GENERAL_ADMISSION">Masuk umum</option>
            <option value="ZONED">Zona</option>
            <option value="RESERVED_SEATING">Kursi bernomor</option>
          </Select>
        </FormSection>
      </fieldset>
      {readOnly ? null : (
        <Button type="submit" loading={loading} className="w-full sm:w-auto">
          {initial?.status === "PUBLISHED" ? "Simpan perubahan" : initial ? "Simpan draf" : "Buat draf"}
        </Button>
      )}
    </form>
  );
}
