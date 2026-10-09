"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { ApplicationForm } from "@/components/organizer/ApplicationForm";
import { OrganizerStatus, type OrganizerProfile } from "@/components/organizer/OrganizerStatus";
import { apiFetch, readApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type ChangeView = {
  pending: { id: string; submittedAt: string | null; name: string; picName: string; bankName: string } | null;
  lastRejected: { decidedAt: string | null; reason: string | null } | null;
};

/**
 * Organizer verification data inside "Edit profil".
 * No application yet: the full form. Approved organizers: edits become a change request that an admin must approve,
 * so verified identity and bank data cannot be swapped without review.
 */
export function OrganizerApplicationSection() {
  const [profile, setProfile] = useState<OrganizerProfile | null>(null);
  const [change, setChange] = useState<ChangeView | null>(null);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    setEditing(false);
    fetch("/api/organizer/application", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.status === 404) {
          setMissing(true);
          setProfile(null);
          setChange(null);
          return;
        }
        if (!res.ok) {
          setError(readApiError(body, "Gagal memuat pengajuan penyelenggara."));
          return;
        }
        const next = body.data as OrganizerProfile;
        setMissing(false);
        setProfile(next);
        if (next.status === "APPROVED") {
          const cr = await fetch("/api/organizer/application/change-request", { credentials: "include", cache: "no-store" });
          const crBody = await cr.json().catch(() => ({}));
          setChange(cr.ok ? (crBody.data as ChangeView) : null);
        } else {
          setChange(null);
        }
      })
      .catch(() => setError("Tidak dapat terhubung ke layanan."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function cancelPending() {
    setBusy(true);
    const res = await apiFetch("/api/organizer/application/change-request", { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError(readApiError(await res.json().catch(() => ({})), "Permintaan tidak dapat dibatalkan."));
      return;
    }
    load();
  }

  const approved = profile?.status === "APPROVED";
  const incomplete = approved && (!profile?.bankAccountNumber || !profile?.hasKtp || !profile?.hasSelfie);

  return (
    <section id="penyelenggara" aria-labelledby="penyelenggara-title" className="mx-auto mt-10 w-full max-w-5xl px-6 pb-16">
      <p className="text-sm font-medium uppercase tracking-[0.24em] text-gold-700">Penyelenggara</p>
      <h2 id="penyelenggara-title" className="font-display mt-3 text-3xl text-ink">
        {missing ? "Ajukan sebagai penyelenggara" : "Data penyelenggara"}
      </h2>
      <p className="mt-2 text-sm text-ink/65">
        {missing
          ? "Lengkapi data, foto KTP, selfie, dan rekening agar admin dapat meninjau akses ke workspace event."
          : approved
            ? "Perubahan data penyelenggara baru berlaku setelah disetujui admin."
            : "Lacak tinjauan admin untuk profil penyelenggara Anda."}
      </p>
      {loading ? (
        <div className="mt-6">
          <LoadingState />
        </div>
      ) : null}
      {error ? (
        <div className="mt-6">
          <Alert tone="error" title="Perhatian">
            {error}
          </Alert>
        </div>
      ) : null}
      {!loading && missing ? (
        <div className="mt-6">
          <ApplicationForm mode="create" onDone={load} />
        </div>
      ) : null}
      {!loading && profile ? (
        <div className="mt-6 space-y-5">
          <OrganizerStatus profile={profile} onRefresh={load} />

          {approved && incomplete && !change?.pending ? (
            <Alert tone="warning" title="Data verifikasi belum lengkap">
              Akun Anda disetujui sebelum rekening, foto KTP, dan selfie diwajibkan. Lengkapi data di bawah; admin akan meninjaunya.
            </Alert>
          ) : null}

          {approved && change?.lastRejected && !change.pending ? (
            <Alert tone="error" title="Perubahan terakhir ditolak admin">
              {change.lastRejected.reason || "Tidak ada catatan."} Data Anda tidak berubah. Anda dapat mengajukan perubahan lagi.
            </Alert>
          ) : null}

          {approved && change?.pending ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
              <p className="font-semibold text-ink">Perubahan menunggu persetujuan admin</p>
              <p className="mt-1 text-sm text-ink/70">
                Dikirim {change.pending.submittedAt ? formatDateTime(change.pending.submittedAt) : "—"}. Data yang tampil di atas tetap data
                lama sampai admin menyetujui.
              </p>
              <Button type="button" variant="secondary" className="mt-4" loading={busy} onClick={cancelPending}>
                Batalkan permintaan
              </Button>
            </div>
          ) : null}

          {approved && !change?.pending && !editing ? (
            <Button type="button" onClick={() => setEditing(true)}>
              {incomplete ? "Lengkapi data verifikasi" : "Edit data penyelenggara"}
            </Button>
          ) : null}

          {approved && !change?.pending && editing ? (
            <ApplicationForm
              mode="change"
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
              onCancel={() => setEditing(false)}
              onDone={load}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
