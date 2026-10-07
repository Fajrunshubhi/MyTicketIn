"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, readApiError, type ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { FormFieldWide, FormSection } from "@/components/ui/FormSection";
import { Icon } from "@/components/ui/Icon";
import { REFUND_BANKS } from "@/lib/server/refund-policy";

type Props = {
  initial?: {
    name: string;
    contactEmail: string;
    contactPhone?: string | null;
    description: string;
    organizerType?: string;
    picName?: string;
    city?: string;
    referenceUrl?: string;
    bankName?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
    hasKtp?: boolean;
    hasSelfie?: boolean;
    version: number;
  };
  mode: "create" | "edit";
  onDone: () => void;
};

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function runeLen(value: string) {
  return [...value.trim()].length;
}

function FileField({
  id,
  label,
  hint,
  file,
  onChange,
  error,
  existing,
}: {
  id: string;
  label: string;
  hint: string;
  file: File | null;
  onChange: (file: File | null) => void;
  error?: string;
  existing: boolean;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label}
      </label>
      <p id={`${id}-hint`} className="mb-1.5 text-xs text-ink/55">
        {hint}
        {existing && !file ? " Berkas sebelumnya tetap dipakai kecuali Anda memilih yang baru." : ""}
      </p>
      <input
        id={id}
        name={id}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-hint`}
        className="block min-h-11 w-full min-w-0 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
      />
      {file ? <p className="mt-1 text-xs text-ink/55">{file.name}</p> : null}
      {error ? (
        <p className="mt-1 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ApplicationForm({ initial, mode, onDone }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [contactEmail, setContactEmail] = useState(initial?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(initial?.contactPhone ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [organizerType, setOrganizerType] = useState(initial?.organizerType ?? "");
  const [picName, setPicName] = useState(initial?.picName ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [referenceUrl, setReferenceUrl] = useState(initial?.referenceUrl ?? "");
  const [bankName, setBankName] = useState(initial?.bankName ?? "");
  const [bankAccountName, setBankAccountName] = useState(initial?.bankAccountName ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState(initial?.bankAccountNumber ?? "");
  const [consent, setConsent] = useState(false);
  const [ktp, setKtp] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mode !== "create" || initial?.contactEmail) return;
    fetch("/api/me", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { data?: { email?: string; name?: string } };
        const email = String(body.data?.email || "").trim();
        const accountName = String(body.data?.name || "").trim();
        if (email) setContactEmail((cur) => cur || email);
        if (accountName.length >= 2) setName((cur) => cur || accountName);
      })
      .catch(() => undefined);
  }, [mode, initial?.contactEmail]);

  const nameCount = runeLen(name);
  const descCount = runeLen(description);
  const descReady = descCount >= 20 && descCount <= 2000;

  function checkFiles(): Record<string, string> {
    const problems: Record<string, string> = {};
    const entries: [string, File | null, boolean | undefined, string][] = [
      ["ktp", ktp, initial?.hasKtp, "Foto KTP wajib diunggah."],
      ["selfie", selfie, initial?.hasSelfie, "Foto selfie wajib diunggah."],
    ];
    for (const [key, file, hadBefore, required] of entries) {
      if (!file) {
        if (mode === "create" || !hadBefore) problems[key] = required;
      } else if (!IMAGE_TYPES.includes(file.type)) {
        problems[key] = "Gunakan gambar JPG, PNG, atau WebP.";
      } else if (file.size > MAX_FILE_BYTES) {
        problems[key] = "Ukuran maksimal 5 MB.";
      }
    }
    return problems;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    const problems = checkFiles();
    if (Object.keys(problems).length) {
      setFieldErrors(problems);
      setError("Periksa kembali berkas yang diunggah.");
      return;
    }
    setLoading(true);
    const path = mode === "create" ? "/api/organizer/applications" : "/api/organizer/application";
    const method = mode === "create" ? "POST" : "PATCH";
    const form = new FormData();
    form.set("name", name);
    form.set("contactEmail", contactEmail);
    form.set("contactPhone", contactPhone.trim());
    form.set("description", description);
    form.set("organizerType", organizerType);
    form.set("picName", picName);
    form.set("city", city);
    form.set("referenceUrl", referenceUrl);
    form.set("bankName", bankName);
    form.set("bankAccountName", bankAccountName);
    form.set("bankAccountNumber", bankAccountNumber);
    form.set("consent", consent ? "true" : "false");
    if (mode === "edit" && initial) form.set("expectedVersion", String(initial.version));
    if (ktp) form.set("ktp", ktp);
    if (selfie) form.set("selfie", selfie);
    // No Content-Type header: the browser sets the multipart boundary.
    const res = await apiFetch(path, { method, body: form });
    const payload = (await res.json().catch(() => ({}))) as ApiError;
    setLoading(false);
    if (!res.ok) {
      setFieldErrors(payload.error?.fieldErrors || {});
      setError(readApiError(payload, "Pengajuan gagal."));
      return;
    }
    onDone();
  }

  return (
    <form
      onSubmit={onSubmit}
      className={
        mode === "create"
          ? "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]"
          : "grid gap-5"
      }
    >
      <div className="grid gap-5">
        {error ? (
          <Alert tone="error" title="Tidak dapat menyimpan">
            {error}
          </Alert>
        ) : null}

        <FormSection
          title="Identitas penyelenggara"
          description="Nama ini tampil di katalog dan halaman event setelah pengajuan disetujui."
        >
          <FormFieldWide>
            <Input
              label="Nama organizer"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={fieldErrors.name}
              hint="2–120 karakter. Gunakan nama organisasi atau brand yang dikenali penonton."
              placeholder="Contoh: Komunitas Musik Bandung"
              autoComplete="organization"
              required
              maxLength={120}
            />
            <p className={`mt-1 text-xs ${nameCount > 120 ? "text-red-700" : "text-ink/45"}`}>{nameCount}/120</p>
          </FormFieldWide>
        </FormSection>

        <FormSection title="Kontak peninjauan" description="Admin memakai kontak ini jika perlu klarifikasi.">
          <Input
            label="Email kontak"
            name="contactEmail"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            error={fieldErrors.contactEmail}
            hint="Email operasional yang aktif dibaca."
            placeholder="organizer@contoh.id"
            autoComplete="email"
            required
          />
          <Input
            label="Telepon / WhatsApp"
            name="contactPhone"
            type="tel"
            inputMode="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            error={fieldErrors.contactPhone}
            hint="Wajib. 8–15 digit, boleh diawali +."
            placeholder="081234567890"
            autoComplete="tel"
            required
          />
        </FormSection>

        <FormSection
          title="Jenis dan penanggung jawab"
          description="Admin mencocokkan nama penanggung jawab dengan KTP yang Anda unggah."
        >
          <div className="min-w-0">
            <label htmlFor="organizerType" className="mb-1 block text-sm font-medium text-ink">
              Jenis penyelenggara
            </label>
            <select
              id="organizerType"
              name="organizerType"
              value={organizerType}
              onChange={(e) => setOrganizerType(e.target.value)}
              aria-invalid={Boolean(fieldErrors.organizerType)}
              required
              className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
            >
              <option value="">Pilih jenis</option>
              <option value="INDIVIDUAL">Individu</option>
              <option value="ORGANIZATION">Komunitas / badan hukum</option>
            </select>
            {fieldErrors.organizerType ? (
              <p className="mt-1 text-sm text-red-700" role="alert">
                {fieldErrors.organizerType}
              </p>
            ) : null}
          </div>
          <Input
            label="Nama penanggung jawab (sesuai KTP)"
            name="picName"
            value={picName}
            onChange={(e) => setPicName(e.target.value)}
            error={fieldErrors.picName}
            hint="Nama lengkap seperti tertulis di KTP."
            autoComplete="name"
            required
            maxLength={120}
          />
          <Input
            label="Kota / kabupaten domisili"
            name="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            error={fieldErrors.city}
            placeholder="Contoh: Bandung"
            autoComplete="address-level2"
            required
            maxLength={80}
          />
          <Input
            label="Tautan bukti kredibilitas"
            name="referenceUrl"
            type="url"
            value={referenceUrl}
            onChange={(e) => setReferenceUrl(e.target.value)}
            error={fieldErrors.referenceUrl}
            hint="Instagram, website, atau portofolio event sebelumnya."
            placeholder="https://instagram.com/komunitasanda"
            required
            maxLength={300}
          />
        </FormSection>

        <FormSection
          title="Rekening penyelenggara"
          description="Rekening untuk pencairan hasil penjualan di tahap berikutnya. Pada versi uji ini tidak ada uang nyata yang ditransfer."
        >
          <div className="min-w-0">
            <label htmlFor="bankName" className="mb-1 block text-sm font-medium text-ink">
              Bank / e-wallet
            </label>
            <select
              id="bankName"
              name="bankName"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              aria-invalid={Boolean(fieldErrors.bankName)}
              required
              className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
            >
              <option value="">Pilih bank</option>
              {REFUND_BANKS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            {fieldErrors.bankName ? (
              <p className="mt-1 text-sm text-red-700" role="alert">
                {fieldErrors.bankName}
              </p>
            ) : null}
          </div>
          <Input
            label="Nomor rekening"
            name="bankAccountNumber"
            inputMode="numeric"
            value={bankAccountNumber}
            onChange={(e) => setBankAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 20))}
            error={fieldErrors.bankAccountNumber}
            hint="8–20 digit, tanpa spasi atau tanda hubung."
            autoComplete="off"
            required
          />
          <FormFieldWide>
            <Input
              label="Nama pemilik rekening"
              name="bankAccountName"
              value={bankAccountName}
              onChange={(e) => setBankAccountName(e.target.value)}
              error={fieldErrors.bankAccountName}
              hint="Sesuai buku tabungan. Admin membandingkannya dengan nama pada KTP."
              autoComplete="off"
              required
              maxLength={80}
            />
          </FormFieldWide>
        </FormSection>

        <FormSection
          title="Dokumen verifikasi"
          description="Foto KTP dan foto selfie wajah (tanpa memegang KTP). JPG, PNG, atau WebP, maksimal 5 MB per berkas."
        >
          <FileField
            id="ktp"
            label="Foto KTP penanggung jawab"
            file={ktp}
            onChange={setKtp}
            error={fieldErrors.ktp}
            existing={mode === "edit" && Boolean(initial?.hasKtp)}
            hint="Pastikan seluruh KTP terlihat jelas dan tidak buram."
          />
          <FileField
            id="selfie"
            label="Foto selfie penanggung jawab"
            file={selfie}
            onChange={setSelfie}
            error={fieldErrors.selfie}
            existing={mode === "edit" && Boolean(initial?.hasSelfie)}
            hint="Wajah terlihat jelas, tanpa kacamata hitam atau masker."
          />
          <FormFieldWide>
            <p className="flex items-start gap-2 rounded-xl bg-stone-50 p-3 text-xs text-ink/65">
              <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
              Berkas disimpan terenkripsi, hanya dapat dilihat admin untuk peninjauan, dan tidak ditampilkan di profil
              publik. Berkas pengajuan yang ditolak dihapus 30 hari setelah keputusan.
            </p>
          </FormFieldWide>
        </FormSection>

        <FormSection
          title="Tentang penyelenggara"
          description="Jelaskan jenis event yang akan dikelola agar admin dapat menilai kesesuaian."
        >
          <FormFieldWide>
            <div className="min-w-0">
              <label htmlFor="description" className="mb-1 block text-sm font-medium text-ink">
                Deskripsi
              </label>
              <p id="description-hint" className="mb-1.5 text-xs text-ink/55">
                Minimal 20 karakter, maksimal 2.000. Hindari data pribadi penonton atau nomor rekening.
              </p>
              <textarea
                id="description"
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                aria-invalid={Boolean(fieldErrors.description)}
                aria-describedby="description-hint description-count"
                placeholder="Contoh: Kami menyelenggarakan konser komunitas dan workshop musik di Bandung, dengan kapasitas 200–800 penonton."
                className="min-h-36 w-full min-w-0 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
                required
                maxLength={2000}
              />
              <p id="description-count" className={`mt-1 text-xs ${descReady ? "text-ink/45" : "text-ink/55"}`}>
                {descCount}/2000 {descCount < 20 ? `(kurang ${20 - descCount} karakter)` : ""}
              </p>
              {fieldErrors.description ? (
                <p className="mt-1 text-sm text-red-700" role="alert">
                  {fieldErrors.description}
                </p>
              ) : null}
            </div>
          </FormFieldWide>
        </FormSection>

        <div className="min-w-0">
          <label className="flex items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              name="consent"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              aria-invalid={Boolean(fieldErrors.consent)}
              className="mt-1 h-4 w-4"
              required
            />
            <span>
              Saya menyatakan data benar dan menyetujui MyTicketIn memproses data identitas saya hanya untuk
              verifikasi penyelenggara.
            </span>
          </label>
          {fieldErrors.consent ? (
            <p className="mt-1 text-sm text-red-700" role="alert">
              {fieldErrors.consent}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/dashboard" className="inline-flex min-h-11 items-center justify-center px-2 text-sm font-medium text-ink/65 hover:text-ink">
            Batalkan
          </Link>
          <Button type="submit" loading={loading} disabled={loading} className="sm:min-w-[12rem]">
            {mode === "create" ? "Kirim pengajuan" : "Simpan perubahan"}
          </Button>
        </div>
      </div>

      {mode === "create" ? (
        <aside className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm lg:sticky lg:top-24">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Alur peninjauan</p>
          <h2 className="mt-1 text-base font-semibold text-ink">Setelah formulir terkirim</h2>
          <ol className="mt-4 space-y-4">
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eee8ff] text-xs font-semibold text-gold-800">1</span>
              <p className="text-sm text-ink/75">Pengajuan berstatus menunggu. Capability organizer belum aktif.</p>
            </li>
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eee8ff] text-xs font-semibold text-gold-800">2</span>
              <p className="text-sm text-ink/75">
                Admin meninjau data, foto KTP, dan foto selfie. Berkas hanya dilihat admin dan tidak ditampilkan publik.
              </p>
            </li>
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eee8ff] text-xs font-semibold text-gold-800">3</span>
              <p className="text-sm text-ink/75">Jika disetujui, Anda dapat menulis draf event dari dashboard penyelenggara.</p>
            </li>
          </ol>
          <p className="mt-5 flex items-start gap-2 text-xs text-ink/50">
            <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
            Status pengajuan dapat dilihat di menu yang sama setelah data terkirim.
          </p>
        </aside>
      ) : null}
    </form>
  );
}
