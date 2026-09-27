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

type Props = {
  initial?: {
    name: string;
    contactEmail: string;
    contactPhone?: string | null;
    description: string;
    version: number;
  };
  mode: "create" | "edit";
  onDone: () => void;
};

function runeLen(value: string) {
  return [...value.trim()].length;
}

export function ApplicationForm({ initial, mode, onDone }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [contactEmail, setContactEmail] = useState(initial?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(initial?.contactPhone ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    setLoading(true);
    const path = mode === "create" ? "/api/organizer/applications" : "/api/organizer/application";
    const method = mode === "create" ? "POST" : "PATCH";
    const body: Record<string, unknown> = {
      name,
      contactEmail,
      contactPhone: contactPhone.trim() ? contactPhone.trim() : null,
      description,
    };
    if (mode === "edit" && initial) {
      body.expectedVersion = initial.version;
    }
    const res = await apiFetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
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

        <FormSection
          title="Kontak peninjauan"
          description="Admin memakai kontak ini jika perlu klarifikasi. Bukan data rekening atau KYC."
        >
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
            label="Telepon (opsional)"
            name="contactPhone"
            type="tel"
            inputMode="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            error={fieldErrors.contactPhone}
            hint="8–15 digit, boleh diawali +. Kosongkan jika hanya email."
            placeholder="081234567890"
            autoComplete="tel"
          />
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
              <p
                id="description-count"
                className={`mt-1 text-xs ${descReady ? "text-ink/45" : "text-ink/55"}`}
              >
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
            <p className="text-sm text-ink/75">Admin meninjau nama, kontak, dan deskripsi. Tidak ada unggahan KYC atau rekening pada MVP.</p>
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
