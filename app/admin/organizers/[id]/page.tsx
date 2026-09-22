"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { LoadingState } from "@/components/ui/LoadingState";
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
  version: number;
  ownerUserId?: string;
};

const decisions: { id: string; label: string }[] = [
  { id: "APPROVE", label: "Setujui" },
  { id: "REJECT", label: "Tolak" },
  { id: "SUSPEND", label: "Tangguhkan" },
  { id: "RESTORE", label: "Pulihkan" },
];

const statusLabel: Record<string, string> = {
  PENDING: "Menunggu tinjauan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  SUSPENDED: "Ditangguhkan",
};

function allowedDecisions(status: string): { id: string; label: string }[] {
  if (status === "PENDING") {
    return decisions.filter((d) => d.id === "APPROVE" || d.id === "REJECT");
  }
  if (status === "APPROVED") {
    return decisions.filter((d) => d.id === "SUSPEND");
  }
  if (status === "SUSPENDED") {
    return decisions.filter((d) => d.id === "RESTORE");
  }
  return [];
}

export default function AdminOrganizerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState("APPROVE");

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
        const allowed = allowedDecisions(next.status);
        setDecision(allowed[0]?.id || "");
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
    const res = await apiFetch(`/api/admin/organizer-applications/${profile.id}/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason, expectedVersion: profile.version }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(readApiError(body, "Keputusan gagal. Muat ulang jika data sudah berubah."));
      return;
    }
    load();
  }

  return (
    <div>
      <Container>
        <h1 className="font-display text-3xl text-ink">Keputusan organizer</h1>
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
        {!forbidden && !profile && !error ? (
          <div className="mt-6">
            <LoadingState />
          </div>
        ) : null}
        {profile ? (
          <div className="mt-6 grid gap-8 lg:grid-cols-2">
            <section>
              <h2 className="text-lg font-semibold">Profil</h2>
              <dl className="mt-4 grid gap-3">
                <div>
                  <dt className="text-sm text-ink/50">Nama</dt>
                  <dd>{profile.name}</dd>
                </div>
                <div>
                  <dt className="text-sm text-ink/50">Status</dt>
                  <dd>{statusLabel[profile.status] || profile.status}</dd>
                </div>
                <div>
                  <dt className="text-sm text-ink/50">Pemilik</dt>
                  <dd>{profile.ownerUserId || "—"}</dd>
                </div>
                <div>
                  <dt className="text-sm text-ink/50">Email</dt>
                  <dd>{profile.contactEmail}</dd>
                </div>
                <div>
                  <dt className="text-sm text-ink/50">Telepon</dt>
                  <dd>{profile.contactPhone || "—"}</dd>
                </div>
                <div>
                  <dt className="text-sm text-ink/50">Diajukan</dt>
                  <dd>
                    <time dateTime={profile.submittedAt}>{formatDateTime(profile.submittedAt)}</time>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-ink/50">Deskripsi</dt>
                  <dd className="whitespace-pre-wrap">{profile.description}</dd>
                </div>
              </dl>
            </section>
            <form onSubmit={onDecide} className="space-y-4">
              <h2 className="text-lg font-semibold">Ambil keputusan</h2>
              {allowedDecisions(profile.status).length === 0 ? (
                <Alert tone="info" title="Tidak ada keputusan admin">
                  Pengajuan ditolak. Organizer harus memperbaiki data dan mengajukan ulang sebelum dapat dimoderasi lagi.
                </Alert>
              ) : (
                <>
              <p className="text-sm text-ink/65">
                {profile.status === "PENDING"
                  ? "Pengajuan baru: Setujui atau Tolak. Alasan wajib 10–1000 karakter."
                  : profile.status === "APPROVED"
                    ? "Organizer sudah aktif. Keputusan berikutnya hanya Tangguhkan."
                    : "Organizer ditangguhkan. Keputusan berikutnya hanya Pulihkan."}
              </p>
              <label className="block text-sm font-medium" htmlFor="decision">
                Keputusan
              </label>
              <select
                id="decision"
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
                className="min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm"
              >
                {allowedDecisions(profile.status).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
              <label className="block text-sm font-medium" htmlFor="reason">
                Alasan
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-32 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
                required
                minLength={10}
                maxLength={1000}
              />
              <Button type="submit">Simpan keputusan</Button>
                </>
              )}
            </form>
          </div>
        ) : null}
      </Container>
    </div>
  );
}
