"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Container } from "@/components/ui/Container";
import { FormFieldWide, FormSection } from "@/components/ui/FormSection";
import { LoadingState } from "@/components/ui/LoadingState";
import {
  DecisionChoice,
  DecisionReasonField,
  ORGANIZER_STATUS_LABEL,
  ReviewBackLink,
  ReviewDecisionCard,
  ReviewField,
  ReviewStatusBadge,
} from "@/components/admin/AdminReview";
import { OrganizerHistory, type OrganizerHistoryEntry } from "@/components/organizer/OrganizerHistory";
import { apiFetch, readApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type Profile = {
  id: string;
  name: string;
  contactEmail: string;
  contactPhone?: string | null;
  description: string;
  status: string;
  decisionReason?: string | null;
  submittedAt: string;
  decidedAt?: string | null;
  appealReason?: string | null;
  appealedAt?: string | null;
  version: number;
  ownerUserId?: string;
  history?: OrganizerHistoryEntry[];
};

const DECISION_COPY: Record<string, { label: string; hint: string }> = {
  APPROVE: {
    label: "Setujui",
    hint: "Pelamar mendapat akses menulis event. Keputusan ini tidak dapat dibatalkan, hanya dapat ditangguhkan nanti.",
  },
  REJECT: {
    label: "Tolak",
    hint: "Pelamar harus memperbaiki data dan mengajukan ulang. Jelaskan apa yang perlu diperbaiki.",
  },
  SUSPEND: {
    label: "Tangguhkan",
    hint: "Akses tulis event dinonaktifkan sampai dipulihkan. Event terbit yang sudah ada tidak otomatis dibatalkan di sini.",
  },
  RESTORE: {
    label: "Pulihkan",
    hint: "Mengembalikan status Disetujui dan akses tulis event. Data event lama tetap ada.",
  },
  DISMISS_APPEAL: {
    label: "Pertahankan penangguhan",
    hint: "Tolak sanggahan. Status tetap Ditangguhkan. Data event tidak dihapus.",
  },
  REVOKE: {
    label: "Cabut akses penyelenggara",
    hint: "Akun kembali sebagai pembeli. Event lama tetap terlihat tetapi tidak dijual. Untuk menjadi penyelenggara lagi, pemilik harus mengajukan ulang.",
  },
};

function allowedIds(status: string): string[] {
  if (status === "PENDING") return ["APPROVE", "REJECT"];
  if (status === "APPROVED") return ["SUSPEND"];
  if (status === "SUSPENDED") return ["RESTORE", "DISMISS_APPEAL", "REVOKE"];
  return [];
}

function reasonHint(decision: string): string {
  if (decision === "APPROVE") return "Catat hasil tinjauan (wajib 10–1000 karakter), misalnya verifikasi nama dan kontak.";
  if (decision === "REJECT") return "Sebutkan kekurangan yang harus diperbaiki pelamar (wajib 10–1000 karakter).";
  if (decision === "SUSPEND") return "Jelaskan alasan penangguhan yang akan dilihat pelamar (wajib 10–1000 karakter).";
  if (decision === "RESTORE") return "Catat alasan pemulihan akses (wajib 10–1000 karakter).";
  if (decision === "DISMISS_APPEAL") return "Jelaskan mengapa sanggahan tidak diterima (wajib 10–1000 karakter).";
  if (decision === "REVOKE") return "Jelaskan mengapa akses penyelenggara dicabut (wajib 10–1000 karakter).";
  return "Alasan wajib 10–1000 karakter.";
}

export default function AdminOrganizerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [history, setHistory] = useState<OrganizerHistoryEntry[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState("APPROVE");
  const [saving, setSaving] = useState(false);

  function load() {
    fetch(`/api/admin/organizer-applications/${params.id}`, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace(`/login?callbackUrl=/admin/organizers/${params.id}`);
          return;
        }
        if (res.status === 403) {
          setForbidden(true);
          return;
        }
        if (!res.ok) {
          setError(readApiError(body, "Pengajuan tidak ditemukan."));
          return;
        }
        const next = (body.data?.profile || body.data) as Profile;
        setProfile(next);
        setHistory(Array.isArray(next.history) ? next.history : []);
        const allowed = allowedIds(next.status);
        setDecision(allowed[0] || "");
      })
      .catch(() => setError("Tidak dapat terhubung ke layanan."));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function onDecide(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setError("");
    setOk("");
    setSaving(true);
    const res = await apiFetch(`/api/admin/organizer-applications/${profile.id}/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason, expectedVersion: profile.version }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(readApiError(body, "Keputusan gagal. Muat ulang jika data sudah berubah."));
      return;
    }
    setReason("");
    setOk("Keputusan tersimpan. Pelamar dapat melihat status terbaru.");
    load();
  }

  const allowed = profile ? allowedIds(profile.status) : [];
  const options = allowed.map((id) => ({ id, ...DECISION_COPY[id] }));
  const submitVariant = decision === "REJECT" || decision === "SUSPEND" || decision === "DISMISS_APPEAL" || decision === "REVOKE" ? "danger" : "primary";

  return (
    <Container>
      <ReviewBackLink href="/admin/organizers">Kembali ke antrean</ReviewBackLink>

      {forbidden ? (
        <div className="mt-6">
          <Alert tone="error" title="Akses ditolak">
            Hanya admin yang dapat memoderasi organizer.
          </Alert>
        </div>
      ) : null}
      {error ? (
        <div className="mt-6">
          <Alert tone="error" title="Perhatian">
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
      {!forbidden && !profile && !error ? (
        <div className="mt-6">
          <LoadingState />
        </div>
      ) : null}

      {profile ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="space-y-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Berkas pengajuan</p>
                <h2 className="mt-1 font-display text-2xl text-ink">{profile.name}</h2>
                <p className="mt-1 text-sm text-ink/55">
                  Diajukan <time dateTime={profile.submittedAt}>{formatDateTime(profile.submittedAt)}</time>
                  {profile.decidedAt ? (
                    <>
                      {" · "}Diputuskan <time dateTime={profile.decidedAt}>{formatDateTime(profile.decidedAt)}</time>
                    </>
                  ) : null}
                </p>
              </div>
              <ReviewStatusBadge
                status={profile.status}
                label={ORGANIZER_STATUS_LABEL[profile.status] || profile.status}
              />
            </header>

            <FormSection title="Identitas" description="Nama publik yang akan tampil di katalog setelah disetujui.">
              <ReviewField label="Nama organisasi">{profile.name}</ReviewField>
              <ReviewField label="ID pemilik (disamarkan)">{profile.ownerUserId || "—"}</ReviewField>
            </FormSection>

            <FormSection title="Kontak" description="Saluran yang dipakai admin jika perlu verifikasi lanjutan.">
              <ReviewField label="Email">
                <a className="text-gold-800 underline-offset-2 hover:underline" href={`mailto:${profile.contactEmail}`}>
                  {profile.contactEmail}
                </a>
              </ReviewField>
              <ReviewField label="Telepon">
                {profile.contactPhone ? (
                  <a className="text-gold-800 underline-offset-2 hover:underline" href={`tel:${profile.contactPhone}`}>
                    {profile.contactPhone}
                  </a>
                ) : (
                  "Tidak diisi"
                )}
              </ReviewField>
            </FormSection>

            <FormSection title="Deskripsi" description="Cakupan kegiatan yang diajukan pelamar.">
              <FormFieldWide>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{profile.description}</p>
              </FormFieldWide>
            </FormSection>

            {profile.appealReason ? (
              <FormSection title="Sanggahan pemilik" description="Pemilik meminta peninjauan ulang atas penangguhan.">
                <ReviewField label="Dikirim">
                  {profile.appealedAt ? <time dateTime={profile.appealedAt}>{formatDateTime(profile.appealedAt)}</time> : "—"}
                </ReviewField>
                <FormFieldWide>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{profile.appealReason}</p>
                </FormFieldWide>
              </FormSection>
            ) : null}

            {profile.decisionReason ? (
              <FormSection title="Catatan keputusan terakhir">
                <FormFieldWide>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{profile.decisionReason}</p>
                </FormFieldWide>
              </FormSection>
            ) : null}

            <OrganizerHistory items={history} viewer="admin" />
          </div>

          {allowed.length === 0 ? (
            <aside className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6 lg:sticky lg:top-4">
              <h2 className="text-base font-semibold text-ink">Tidak ada aksi</h2>
              <p className="mt-2 text-sm text-ink/65">
                Pengajuan ditolak atau akses penyelenggara dicabut. Pemilik harus memperbaiki data dan mengajukan ulang sebelum dapat dimoderasi lagi.
              </p>
            </aside>
          ) : (
            <div className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto">
            <ReviewDecisionCard
              title="Ambil keputusan"
              description="Tinjau berkas di kiri, pilih aksi, lalu tulis alasan yang akan dikirim ke pelamar."
              onSubmit={onDecide}
              submitting={saving}
              submitLabel={DECISION_COPY[decision]?.label ? `Simpan: ${DECISION_COPY[decision].label}` : "Simpan keputusan"}
              submitVariant={submitVariant}
            >
              <DecisionChoice name="organizer-decision" options={options} value={decision} onChange={setDecision} />
              <DecisionReasonField
                id="reason"
                value={reason}
                onChange={setReason}
                hint={reasonHint(decision)}
              />
            </ReviewDecisionCard>
            </div>
          )}
        </div>
      ) : null}
    </Container>
  );
}
