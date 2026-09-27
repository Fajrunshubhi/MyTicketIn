"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/ui/LoadingState";
import { Alert } from "@/components/ui/Alert";
import { OrganizerStatus, type OrganizerProfile } from "@/components/organizer/OrganizerStatus";
import { readApiError } from "@/lib/api";

export default function OrganizerStatusPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<OrganizerProfile | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetch("/api/organizer/application", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace("/login?callbackUrl=/dashboard/organizer/status");
          return;
        }
        if (res.status === 404) {
          setMissing(true);
          setProfile(null);
          setLoading(false);
          return;
        }
        if (!res.ok) {
          setError(readApiError(body, "Gagal memuat status."));
          setLoading(false);
          return;
        }
        setMissing(false);
        setProfile(body.data as OrganizerProfile);
        setLoading(false);
      })
      .catch(() => {
        setError("Tidak dapat terhubung ke layanan.");
        setLoading(false);
      });
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-sm text-ink/65">
        Lacak tinjauan admin untuk profil penyelenggara. Pengajuan yang menunggu tidak dapat diubah sampai ada keputusan.
      </p>
      {loading ? (
        <div className="mt-6">
          <LoadingState />
        </div>
      ) : null}
      {error ? (
        <div className="mt-6">
          <Alert tone="error" title="Gagal memuat">
            {error}
          </Alert>
        </div>
      ) : null}
      {missing ? (
        <div className="mt-6 rounded-3xl border border-dashed border-stone-200 bg-white p-8 text-center">
          <p className="font-semibold text-ink">Belum ada pengajuan</p>
          <p className="mt-1 text-sm text-ink/60">Isi profil organizer terlebih dahulu agar admin dapat meninjau akses event.</p>
          <Link
            href="/dashboard/organizer/apply"
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-gold-500 px-4 text-sm font-semibold text-white"
          >
            Ajukan sebagai penyelenggara
          </Link>
        </div>
      ) : null}
      {profile ? (
        <div className="mt-6">
          <OrganizerStatus profile={profile} onRefresh={load} />
        </div>
      ) : null}
    </div>
  );
}
