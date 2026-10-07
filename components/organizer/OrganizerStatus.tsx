"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch, readApiError } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { formatDateTime } from "@/lib/format";
import { maskAccountNumber } from "@/lib/server/refund-policy";
import { ApplicationForm } from "@/components/organizer/ApplicationForm";
import { OrganizerHistory, type OrganizerHistoryEntry } from "@/components/organizer/OrganizerHistory";

export type OrganizerProfile = {
  id: string;
  name: string;
  contactEmail: string;
  contactPhone?: string | null;
  description: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  decisionReason?: string | null;
  submittedAt: string;
  decidedAt?: string | null;
  appealReason?: string | null;
  appealedAt?: string | null;
  organizerType?: "INDIVIDUAL" | "ORGANIZATION" | null;
  picName?: string | null;
  city?: string | null;
  referenceUrl?: string | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  hasKtp?: boolean;
  hasSelfie?: boolean;
  version: number;
  history?: OrganizerHistoryEntry[];
};

const STATUS: Record<
  OrganizerProfile["status"],
  { label: string; hint: string; tone: string; icon: IconName }
> = {
  PENDING: {
    label: "Sedang ditinjau",
    hint: "Admin belum mengambil keputusan. Anda belum dapat membuat event.",
    tone: "bg-[#eee8ff] text-gold-800",
    icon: "clock",
  },
  APPROVED: {
    label: "Disetujui",
    hint: "Akses penyelenggara aktif. Anda dapat menulis draf event.",
    tone: "bg-emerald-50 text-emerald-800",
    icon: "success",
  },
  REJECTED: {
    label: "Ditolak",
    hint: "Akses penyelenggara tidak aktif. Perbarui data sesuai catatan admin, simpan, lalu ajukan ulang jika ingin menjadi penyelenggara lagi.",
    tone: "bg-red-50 text-red-800",
    icon: "error",
  },
  SUSPENDED: {
    label: "Ditangguhkan",
    hint: "Event dan data lama tetap ada. Aksi baru ditahan sampai admin memulihkan. Anda dapat mengirim sanggahan.",
    tone: "bg-stone-100 text-ink/70",
    icon: "info",
  },
};

function when(iso?: string | null) {
  if (!iso) return "";
  try {
    return formatDateTime(iso);
  } catch {
    return "";
  }
}

export function OrganizerStatus({ profile, onRefresh }: { profile: OrganizerProfile; onRefresh: () => void }) {
  const meta = STATUS[profile.status];
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [appeal, setAppeal] = useState("");
  const [appealing, setAppealing] = useState(false);
  const submitted = when(profile.submittedAt);
  const decided = when(profile.decidedAt);

  async function resubmit() {
    setError("");
    setLoading(true);
    const res = await apiFetch("/api/organizer/application/resubmit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion: profile.version }),
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(readApiError(payload, "Pengajuan ulang gagal."));
      return;
    }
    onRefresh();
  }

  async function sendAppeal() {
    setError("");
    setAppealing(true);
    const res = await apiFetch("/api/organizer/application/appeal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: appeal, expectedVersion: profile.version }),
    });
    const payload = await res.json().catch(() => ({}));
    setAppealing(false);
    if (!res.ok) {
      setError(readApiError(payload, "Sanggahan gagal dikirim."));
      return;
    }
    setAppeal("");
    onRefresh();
  }

  const steps = [
    { title: "Pengajuan dikirim", done: true, current: false, detail: submitted ? `Pada ${submitted}` : "Terkirim" },
    {
      title: "Ditinjau admin",
      done: profile.status !== "PENDING",
      current: profile.status === "PENDING",
      detail: profile.status === "PENDING" ? "Menunggu keputusan" : decided ? `Selesai ${decided}` : "Selesai",
    },
    {
      title: profile.status === "REJECTED" ? "Perlu perbaikan" : profile.status === "SUSPENDED" ? "Ditangguhkan" : "Keputusan",
      done: profile.status === "APPROVED",
      current: profile.status === "REJECTED" || profile.status === "SUSPENDED",
      detail:
        profile.status === "APPROVED"
          ? "Disetujui"
          : profile.status === "REJECTED"
            ? "Ditolak — perbarui dan ajukan ulang"
            : profile.status === "SUSPENDED"
              ? "Akses ditahan"
              : "Belum ada keputusan",
    },
  ];

  return (
    <div className="grid gap-5">
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Pengajuan organizer</p>
            <h2 className="mt-1 font-display text-2xl text-ink">{profile.name}</h2>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${meta.tone}`}>
            <Icon name={meta.icon} className="h-3.5 w-3.5" />
            {meta.label}
          </span>
        </div>
        <p className="mt-3 text-sm text-ink/70">{meta.hint}</p>
        {submitted ? (
          <p className="mt-2 text-xs text-ink/45">
            Diajukan <time dateTime={profile.submittedAt}>{submitted}</time>
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Jejak pengajuan</p>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          {steps.map((step, idx) => (
            <li key={step.title} className="flex gap-3 sm:block">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold sm:mb-2 ${
                  step.done
                    ? "bg-emerald-50 text-emerald-800"
                    : step.current
                      ? "bg-[#eee8ff] text-gold-800"
                      : "bg-stone-100 text-ink/45"
                }`}
              >
                {idx + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-ink">{step.title}</p>
                <p className="mt-0.5 text-xs text-ink/55">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        {profile.status === "PENDING" ? (
          <p className="mt-4 flex items-start gap-2 text-xs text-ink/50">
            <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
            Tidak perlu mengirim ulang. Keputusan admin akan tampil di halaman ini.
          </p>
        ) : null}
      </section>

      {profile.decisionReason ? (
        <Alert tone={profile.status === "REJECTED" ? "error" : "info"} title="Catatan admin">
          {profile.decisionReason}
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="error" title="Gagal">
          {error}
        </Alert>
      ) : null}

      {profile.status !== "REJECTED" ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="text-base font-semibold text-ink">Data yang dikirim</h3>
          <p className="mt-1 text-sm text-ink/55">Isian terkunci selama pengajuan ditinjau.</p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink/40">Nama organizer</dt>
              <dd className="mt-1 font-medium text-ink">{profile.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink/40">Email kontak</dt>
              <dd className="mt-1 break-all text-ink">{profile.contactEmail}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink/40">Telepon</dt>
              <dd className="mt-1 text-ink">{profile.contactPhone || "Tidak diisi"}</dd>
            </div>
            {profile.organizerType ? (
              <>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink/40">Jenis penyelenggara</dt>
                  <dd className="mt-1 text-ink">{profile.organizerType === "INDIVIDUAL" ? "Individu" : "Komunitas / badan hukum"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink/40">Penanggung jawab</dt>
                  <dd className="mt-1 text-ink">{profile.picName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink/40">Kota / kabupaten</dt>
                  <dd className="mt-1 text-ink">{profile.city}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink/40">Tautan bukti</dt>
                  <dd className="mt-1 break-all text-ink">{profile.referenceUrl}</dd>
                </div>
                {profile.bankAccountNumber ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-ink/40">Rekening</dt>
                    <dd className="mt-1 text-ink">
                      {profile.bankName} · <span className="font-mono">{maskAccountNumber(profile.bankAccountNumber)}</span> · a.n.{" "}
                      {profile.bankAccountName}
                    </dd>
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink/40">Dokumen verifikasi</dt>
                  <dd className="mt-1 text-sm text-ink">
                    Foto KTP {profile.hasKtp ? "terunggah" : "belum ada"} · Foto selfie {profile.hasSelfie ? "terunggah" : "belum ada"}
                    . Hanya admin yang dapat melihatnya.
                  </dd>
                </div>
              </>
            ) : null}
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink/40">Deskripsi</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">{profile.description}</dd>
            </div>
          </dl>
        </section>
      ) : (
        <section className="space-y-4">
          <p className="text-sm text-ink/70">Perbarui isian, simpan, lalu ajukan ulang agar masuk antrean tinjau.</p>
          <ApplicationForm
            mode="edit"
            initial={{
              name: profile.name,
              contactEmail: profile.contactEmail,
              contactPhone: profile.contactPhone,
              description: profile.description,
              organizerType: profile.organizerType ?? undefined,
              picName: profile.picName ?? undefined,
              city: profile.city ?? undefined,
              referenceUrl: profile.referenceUrl ?? undefined,
              bankName: profile.bankName ?? undefined,
              bankAccountName: profile.bankAccountName ?? undefined,
              bankAccountNumber: profile.bankAccountNumber ?? undefined,
              hasKtp: profile.hasKtp,
              hasSelfie: profile.hasSelfie,
              version: profile.version,
            }}
            onDone={onRefresh}
          />
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-ink">Kirim ulang ke admin</p>
            <p className="mt-1 text-sm text-ink/65">Pastikan perubahan sudah disimpan sebelum mengajukan ulang.</p>
            <Button className="mt-4" type="button" loading={loading} disabled={loading} onClick={() => void resubmit()}>
              Ajukan ulang
            </Button>
          </div>
        </section>
      )}

      {profile.status === "APPROVED" || profile.status === "SUSPENDED" ? (
        <Link
          href="/dashboard/event"
          className="inline-flex min-h-11 w-fit items-center rounded-full bg-gold-500 px-4 text-sm font-semibold text-white"
        >
          {profile.status === "SUSPENDED" ? "Lihat event yang sudah ada" : "Buka workspace event"}
        </Link>
      ) : null}

      {profile.status === "SUSPENDED" ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="text-base font-semibold text-ink">Sanggahan</h3>
          <p className="mt-1 text-sm text-ink/65">
            Jelaskan mengapa penangguhan perlu ditinjau ulang. Admin melihat teks ini pada berkas moderasi. Event lama tidak dihapus.
          </p>
          {profile.appealReason ? (
            <div className="mt-4 rounded-xl border border-stone-100 bg-stone-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Sanggahan terakhir</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{profile.appealReason}</p>
              {profile.appealedAt ? (
                <p className="mt-2 text-xs text-ink/45">
                  Dikirim <time dateTime={profile.appealedAt}>{when(profile.appealedAt)}</time>
                </p>
              ) : null}
            </div>
          ) : null}
          <label htmlFor="appeal" className="mt-4 block text-sm font-medium text-ink">
            {profile.appealReason ? "Perbarui sanggahan" : "Tulis sanggahan"}
          </label>
          <textarea
            id="appeal"
            value={appeal}
            onChange={(e) => setAppeal(e.target.value)}
            minLength={10}
            maxLength={1000}
            rows={5}
            className="mt-1 min-h-28 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-ink/45">{[...appeal].length}/1000 · wajib 10–1000 karakter</p>
          <Button className="mt-4" type="button" loading={appealing} disabled={appealing} onClick={() => void sendAppeal()}>
            {profile.appealReason ? "Kirim pembaruan" : "Kirim sanggahan"}
          </Button>
        </section>
      ) : null}

      <OrganizerHistory items={profile.history || []} viewer="owner" />
    </div>
  );
}
