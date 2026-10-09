"use client";

import type { FormEvent } from "react";
import { formatDateTime } from "@/lib/format";

export type PendingChange = {
  id: string;
  submittedAt: string | null;
  name: string;
  contactEmail: string;
  contactPhone: string;
  description: string;
  organizerType: string;
  picName: string;
  city: string;
  referenceUrl: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  newKtp: boolean;
  newSelfie: boolean;
};

export type CurrentProfile = {
  name: string;
  contactEmail: string;
  contactPhone?: string | null;
  description: string;
  organizerType?: string | null;
  picName?: string | null;
  city?: string | null;
  referenceUrl?: string | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
};

const TYPE_LABEL: Record<string, string> = { INDIVIDUAL: "Individu", ORGANIZATION: "Komunitas / badan hukum" };

export function OrganizerChangeReview({
  change,
  current,
  showDocs,
  onShowDocs,
  decision,
  onDecision,
  reason,
  onReason,
  saving,
  onSubmit,
}: {
  change: PendingChange;
  current: CurrentProfile;
  showDocs: boolean;
  onShowDocs: () => void;
  decision: string;
  onDecision: (value: string) => void;
  reason: string;
  onReason: (value: string) => void;
  saving: boolean;
  onSubmit: (event: FormEvent) => void;
}) {
  const rows: { label: string; before: string; after: string }[] = [
    { label: "Nama organizer", before: current.name, after: change.name },
    { label: "Email kontak", before: current.contactEmail, after: change.contactEmail },
    { label: "Telepon", before: current.contactPhone || "—", after: change.contactPhone },
    {
      label: "Jenis",
      before: TYPE_LABEL[current.organizerType || ""] || "—",
      after: TYPE_LABEL[change.organizerType] || change.organizerType,
    },
    { label: "Penanggung jawab", before: current.picName || "—", after: change.picName },
    { label: "Kota", before: current.city || "—", after: change.city },
    { label: "Tautan bukti", before: current.referenceUrl || "—", after: change.referenceUrl },
    {
      label: "Rekening",
      before: current.bankAccountNumber
        ? `${current.bankName} · ${current.bankAccountNumber} · a.n. ${current.bankAccountName}`
        : "—",
      after: `${change.bankName} · ${change.bankAccountNumber} · a.n. ${change.bankAccountName}`,
    },
    { label: "Deskripsi", before: current.description, after: change.description },
  ];

  return (
    <section aria-labelledby="change-title" className="rounded-2xl border border-amber-300 bg-amber-50 p-5 sm:p-6">
      <h3 id="change-title" className="text-base font-semibold text-ink">
        Permintaan perubahan data menunggu keputusan
      </h3>
      <p className="mt-1 text-sm text-ink/70">
        Diajukan {change.submittedAt ? formatDateTime(change.submittedAt) : "—"}. Profil aktif tidak berubah sampai Anda menyetujui.
      </p>

      <dl className="mt-4 space-y-3">
        {rows.map((row) => {
          const changed = row.before !== row.after;
          return (
            <div key={row.label} className="rounded-xl bg-white p-3 text-sm">
              <dt className="flex items-center gap-2 font-medium text-ink">
                {row.label}
                {changed ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Berubah</span>
                ) : (
                  <span className="text-xs text-ink/45">Sama</span>
                )}
              </dt>
              {changed ? (
                <dd className="mt-1 grid gap-1 sm:grid-cols-2">
                  <span className="break-words text-ink/55">Sekarang: {row.before}</span>
                  <span className="break-words text-ink">Usulan: {row.after}</span>
                </dd>
              ) : (
                <dd className="mt-1 break-words text-ink/70">{row.after}</dd>
              )}
            </div>
          );
        })}
      </dl>

      <div className="mt-4">
        {change.newKtp || change.newSelfie ? (
          showDocs ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {change.newKtp ? (
                <figure>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/admin/organizer-change-requests/${change.id}/documents/ktp`}
                    alt={`Foto KTP baru ${change.picName}`}
                    className="max-h-80 w-full rounded-xl border border-stone-200 bg-white object-contain"
                  />
                  <figcaption className="mt-1 text-xs text-ink/55">Foto KTP baru</figcaption>
                </figure>
              ) : null}
              {change.newSelfie ? (
                <figure>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/admin/organizer-change-requests/${change.id}/documents/selfie`}
                    alt={`Foto selfie baru ${change.picName}`}
                    className="max-h-80 w-full rounded-xl border border-stone-200 bg-white object-contain"
                  />
                  <figcaption className="mt-1 text-xs text-ink/55">Foto selfie baru</figcaption>
                </figure>
              ) : null}
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={onShowDocs}
                className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 text-sm font-medium text-ink hover:bg-stone-50"
              >
                Tampilkan dokumen baru
              </button>
              <p className="mt-1 text-xs text-ink/55">Setiap akses dokumen dicatat di audit log.</p>
            </div>
          )
        ) : (
          <p className="text-sm text-ink/65">Tidak ada dokumen baru; dokumen yang sudah tersimpan tetap dipakai.</p>
        )}
      </div>

      <form onSubmit={onSubmit} className="mt-5 space-y-3">
        <fieldset>
          <legend className="text-sm font-medium text-ink">Keputusan</legend>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            {[
              ["APPROVE", "Setujui dan terapkan"],
              ["REJECT", "Tolak"],
            ].map(([value, label]) => (
              <label key={value} className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name="change-decision"
                  value={value}
                  checked={decision === value}
                  onChange={() => onDecision(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="change-reason" className="block text-sm font-medium text-ink">
            Alasan (10–1000 karakter)
          </label>
          <textarea
            id="change-reason"
            value={reason}
            onChange={(e) => onReason(e.target.value)}
            required
            minLength={10}
            maxLength={1000}
            className="mt-1 min-h-24 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-ink"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="min-h-11 rounded-full bg-gold-500 px-5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Menyimpan…" : "Simpan keputusan"}
        </button>
      </form>
    </section>
  );
}
