"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { apiFetch, readApiError, type ApiError } from "@/lib/api";
import { naiveLocalToUtcIso, utcIsoToNaiveLocal } from "@/lib/format";
import { eventMapQuery, googleMapsEmbedUrl, googleMapsSearchUrl } from "@/lib/maps";
import { FloatingAlert } from "@/components/ui/FloatingAlert";
import { Button } from "@/components/ui/Button";
import { FormFieldWide, FormSection } from "@/components/ui/FormSection";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { TIMEZONES, type EventRecord, type InventoryMode } from "@/components/events/event-types";

const CATEGORY_OPTIONS = ["Festival", "FILM", "Musik", "Olahraga", "Seminar", "Seni"];

const TZ_OPTIONS: { value: (typeof TIMEZONES)[number]; label: string }[] = [
  { value: "Asia/Jakarta", label: "WIB — Jakarta, Bandung, Yogyakarta" },
  { value: "Asia/Makassar", label: "WITA — Makassar, Denpasar, Balikpapan" },
  { value: "Asia/Jayapura", label: "WIT — Jayapura, Ambon" },
];

const MODE_HELP: Record<InventoryMode, string> = {
  GENERAL_ADMISSION: "Pembeli membeli tiket masuk tanpa memilih tempat duduk. Cocok untuk festival, standing concert, atau networking.",
  ZONED: "Pembeli memilih zona atau tribune, lalu duduk bebas di zona itu. Harga dan sisa kuota terpisah per zona.",
  RESERVED_SEATING: "Pembeli memilih kursi bernomor. Setiap kursi hanya untuk satu tiket. Mode terkunci setelah ada transaksi.",
};

function runeLen(value: string): number {
  return [...value].length;
}

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
  const [showExtras, setShowExtras] = useState(() => Boolean(initial?.tags?.length || initial?.contactPhone));
  const [categoryOther, setCategoryOther] = useState(
    () => Boolean(initial?.category && !CATEGORY_OPTIONS.includes(initial.category)),
  );

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
    const nextErrors: Record<string, string> = {};
    if (runeLen(values.title.trim()) < 3 || runeLen(values.title.trim()) > 160) {
      nextErrors.title = "Judul wajib 3–160 karakter.";
    }
    if (runeLen(values.description.trim()) < 20) {
      nextErrors.description = "Deskripsi wajib minimal 20 karakter.";
    }
    if (!values.startsAt || !values.endsAt) {
      nextErrors.startsAt = "Isi waktu mulai dan selesai.";
    } else if (values.startsAt >= values.endsAt) {
      nextErrors.endsAt = "Waktu selesai harus setelah waktu mulai.";
    }
    if (Object.keys(nextErrors).length) {
      setLoading(false);
      setFieldErrors(nextErrors);
      setToast({ tone: "error", title: "Lengkapi data", body: "Periksa field yang ditandai sebelum menyimpan." });
      return;
    }
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
  const isCreate = !initial;
  const titleLen = runeLen(values.title);
  const descLen = runeLen(values.description);
  const latOk =
    values.latitude.trim() !== "" &&
    values.longitude.trim() !== "" &&
    Number.isFinite(Number(values.latitude.replace(",", "."))) &&
    Number.isFinite(Number(values.longitude.replace(",", ".")));
  const checks = [
    { ok: titleLen >= 3 && titleLen <= 160, label: "Judul" },
    { ok: Boolean(values.category.trim()), label: "Kategori" },
    { ok: Boolean(values.startsAt && values.endsAt && values.startsAt < values.endsAt), label: "Jadwal" },
    {
      ok: Boolean(values.venueName && values.addressLine && values.city && values.province && latOk),
      label: "Lokasi dan peta",
    },
    { ok: descLen >= 20, label: "Deskripsi" },
    { ok: values.galleryUrls.length > 0, label: "Foto sampul", optional: true },
    { ok: Boolean(values.terms.trim() && values.contactEmail.trim()), label: "Syarat dan kontak" },
  ];
  const requiredDone = checks.filter((c) => !c.optional && c.ok).length;
  const requiredTotal = checks.filter((c) => !c.optional).length;
  const submitLabel = initial?.status === "PUBLISHED" ? "Simpan perubahan" : initial ? "Simpan draf" : "Buat draf";

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start xl:gap-6">
      <form onSubmit={onSubmit} className="grid max-w-3xl gap-5">
        {toast ? (
          <FloatingAlert tone={toast.tone} title={toast.title} onClose={() => setToast(null)}>
            {toast.body}
          </FloatingAlert>
        ) : null}
        <fieldset disabled={disabled} className="contents">
          <FormSection
            title="Dasar event"
            description="Judul yang spesifik membantu pembeli menemukan event. Jangan masukkan tanggal atau kota di judul — itu punya bagian sendiri."
            columns={1}
          >
            <Input
              label="Judul"
              name="title"
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
              error={fieldErrors.title}
              hint={`${titleLen}/160 · Ideal di bawah 75 karakter, tanpa ALL CAPS.`}
              maxLength={160}
              required
              autoComplete="off"
            />
            <div>
              <Select
                id="category"
                label="Kategori"
                value={categoryOther ? "__other__" : values.category}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__other__") {
                    setCategoryOther(true);
                    if (CATEGORY_OPTIONS.includes(values.category)) set("category", "");
                    return;
                  }
                  setCategoryOther(false);
                  set("category", v);
                }}
                required
              >
                <option value="" disabled>
                  Pilih kategori
                </option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="__other__">Lainnya</option>
              </Select>
              {categoryOther ? (
                <div className="mt-3">
                  <Input
                    label="Nama kategori"
                    name="categoryCustom"
                    value={values.category}
                    onChange={(e) => set("category", e.target.value)}
                    error={fieldErrors.category}
                    hint="2–80 karakter."
                    required
                  />
                </div>
              ) : fieldErrors.category ? (
                <p className="mt-1 text-sm text-red-700" role="alert">{fieldErrors.category}</p>
              ) : null}
            </div>
          </FormSection>

          <FormSection title="Tanggal dan waktu" description="Gunakan zona waktu venue, bukan zona perangkat Anda.">
            <FormFieldWide>
              <Select id="timezone" label="Zona waktu" value={values.timezone} onChange={(e) => set("timezone", e.target.value)}>
                {TZ_OPTIONS.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </Select>
            </FormFieldWide>
            <Input label="Mulai" name="startsAt" type="datetime-local" value={values.startsAt} onChange={(e) => set("startsAt", e.target.value)} error={fieldErrors.startsAt} required />
            <Input label="Selesai" name="endsAt" type="datetime-local" value={values.endsAt} onChange={(e) => set("endsAt", e.target.value)} error={fieldErrors.endsAt} required />
          </FormSection>

          <FormSection title="Lokasi" description="Koordinat wajib agar peta dan filter kota akurat.">
            <FormFieldWide>
              <Input label="Nama venue" name="venueName" value={values.venueName} onChange={(e) => set("venueName", e.target.value)} error={fieldErrors.venueName} required />
            </FormFieldWide>
            <FormFieldWide>
              <Input label="Alamat" name="addressLine" value={values.addressLine} onChange={(e) => set("addressLine", e.target.value)} error={fieldErrors.addressLine} required />
            </FormFieldWide>
            <Input label="Kota" name="city" value={values.city} onChange={(e) => set("city", e.target.value)} error={fieldErrors.city} required />
            <Input label="Provinsi" name="province" value={values.province} onChange={(e) => set("province", e.target.value)} error={fieldErrors.province} required />
            <FormFieldWide>
              <p className="text-sm text-ink/65">Buka Google Maps, klik kanan titik venue, lalu salin lintang dan bujur.</p>
              <a
                className="text-sm font-medium text-gold-800 underline-offset-2 hover:underline"
                href={googleMapsSearchUrl(eventMapQuery({ venueName: values.venueName, addressLine: values.addressLine, city: values.city, province: values.province }))}
                target="_blank"
                rel="noreferrer"
              >
                Cari alamat ini di Google Maps
              </a>
            </FormFieldWide>
            <Input label="Lintang" name="latitude" inputMode="decimal" value={values.latitude} onChange={(e) => set("latitude", e.target.value)} error={fieldErrors.latitude} hint="Contoh: -6,1754" required />
            <Input label="Bujur" name="longitude" inputMode="decimal" value={values.longitude} onChange={(e) => set("longitude", e.target.value)} error={fieldErrors.longitude} hint="Contoh: 106,8272" required />
            {latOk ? (
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

          <FormSection
            title="Halaman publik"
            description="Deskripsi 150–200 kata paling mudah dibaca. Foto pertama menjadi sampul katalog (rasio 2:1 disarankan)."
            columns={1}
          >
            <div>
              <label htmlFor="description" className="mb-1 block text-sm font-medium text-ink">
                Deskripsi
              </label>
              <p className="mb-1.5 text-xs text-ink/55">Minimal 20 karakter. Jelaskan siapa yang cocok datang, apa yang terjadi, dan mengapa.</p>
              <textarea
                id="description"
                name="description"
                rows={7}
                className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
                required
              />
              <p className="mt-1 text-xs text-ink/45">{descLen} karakter</p>
              {fieldErrors.description ? <p className="mt-1 text-sm text-red-700" role="alert">{fieldErrors.description}</p> : null}
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-ink">Galeri</p>
              <p className="mb-2 text-xs text-ink/55">Hingga 8 foto JPEG, PNG, atau WebP, maks. 5 MB. Foto pertama adalah sampul.</p>
              <ul className="grid gap-2 sm:grid-cols-4">
                {values.galleryUrls.map((url, index) => (
                  <li key={url} className="relative overflow-hidden rounded-xl border border-stone-200">
                    <img src={url} alt="" className="h-24 w-full object-cover" />
                    {index === 0 ? (
                      <span className="absolute left-1 top-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink">
                        Sampul
                      </span>
                    ) : null}
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
            </div>
          </FormSection>

          <FormSection
            title="Penjualan"
            description="Pilih cara pembeli menempati venue. Masuk umum = tanpa tempat. Zona = pilih tribune. Kursi bernomor = pilih kursi. Mode tidak dapat diubah setelah ada transaksi."
            columns={1}
          >
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink">Mode inventori</legend>
              <ul className="grid gap-2">
                {(Object.keys(MODE_HELP) as InventoryMode[]).map((mode) => (
                  <li key={mode}>
                    <label
                      className={`flex cursor-pointer gap-3 rounded-2xl border px-4 py-3 ${
                        values.inventoryMode === mode ? "border-gold-500 bg-gold-50" : "border-stone-200 bg-white"
                      } ${lockInventory ? "cursor-not-allowed opacity-70" : ""}`}
                    >
                      <input
                        type="radio"
                        name="inventoryMode"
                        className="mt-1"
                        value={mode}
                        checked={values.inventoryMode === mode}
                        disabled={lockInventory}
                        onChange={() => set("inventoryMode", mode)}
                      />
                      <span>
                        <span className="block text-sm font-semibold text-ink">
                          {mode === "GENERAL_ADMISSION" ? "Masuk umum" : mode === "ZONED" ? "Zona" : "Kursi bernomor"}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink/55">{MODE_HELP[mode]}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            <div>
              <label htmlFor="terms" className="mb-1 block text-sm font-medium text-ink">
                Syarat tiket
              </label>
              <p className="mb-1.5 text-xs text-ink/55">Refund, usia, atau aturan masuk yang pembeli harus tahu sebelum bayar.</p>
              <textarea
                id="terms"
                name="terms"
                rows={4}
                className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                value={values.terms}
                onChange={(e) => set("terms", e.target.value)}
                required
              />
            </div>
            <Input label="Email kontak" name="contactEmail" type="email" value={values.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} error={fieldErrors.contactEmail} hint="Ditampilkan jika pembeli perlu menghubungi Anda." required />
          </FormSection>

          <FormSection title="Pelengkap" description="Tidak wajib untuk menyimpan draf." columns={1}>
            {showExtras ? (
              <>
                <div>
                  <label htmlFor="tagDraft" className="mb-1 block text-sm font-medium">
                    Tag pencarian
                  </label>
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
                </div>
                <Input label="Telepon (opsional)" name="contactPhone" value={values.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} error={fieldErrors.contactPhone} />
              </>
            ) : (
              <button type="button" className="text-left text-sm font-medium text-gold-800 underline-offset-2 hover:underline" onClick={() => setShowExtras(true)}>
                Tambah tag pencarian dan telepon
              </button>
            )}
          </FormSection>
        </fieldset>

        {readOnly ? null : (
          <div className="sticky bottom-0 z-20 -mx-1 flex flex-wrap items-center gap-3 border-t border-stone-200 bg-[#f7f8fd]/95 px-1 py-3 backdrop-blur">
            <Button type="submit" loading={loading}>
              {submitLabel}
            </Button>
            {isCreate ? (
              <Link href="/dashboard/event" className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-ink/70 hover:text-ink">
                Batal
              </Link>
            ) : null}
            <p className="text-xs text-ink/50">{requiredDone}/{requiredTotal} bagian wajib terisi</p>
          </div>
        )}
      </form>

      <aside className="mt-6 hidden xl:sticky xl:top-4 xl:mt-0 xl:block" aria-label="Kelengkapan draf">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-ink">Kelengkapan</p>
          <p className="mt-1 text-xs text-ink/55">
            {requiredDone} dari {requiredTotal} wajib siap. Tiket ditambahkan setelah draf tersimpan.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {checks.map((item) => (
              <li key={item.label} className={item.ok ? "text-emerald-800" : "text-ink/55"}>
                <span aria-hidden="true">{item.ok ? "✓" : "○"} </span>
                {item.label}
                {item.optional ? <span className="text-ink/40"> (opsional)</span> : null}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
