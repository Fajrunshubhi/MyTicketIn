"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Container } from "@/components/ui/Container";
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
          router.replace("/login?callbackUrl=/organizer/status");
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
    <div>
      <Container>
        <h1 className="font-display text-3xl text-ink">Status organizer</h1>
        {loading ? <div className="mt-6"><LoadingState /></div> : null}
        {error ? (
          <div className="mt-6">
            <Alert tone="error" title="Gagal memuat">
              {error}
            </Alert>
          </div>
        ) : null}
        {missing ? (
          <div className="mt-6">
            <p>Anda belum memiliki pengajuan.</p>
            <p className="mt-3">
              <Link className="text-gold-700 underline-offset-2 hover:underline" href="/organizer/apply">
                Ajukan profil organizer
              </Link>
            </p>
          </div>
        ) : null}
        {profile ? (
          <div className="mt-6">
            <OrganizerStatus profile={profile} onRefresh={load} />
          </div>
        ) : null}
      </Container>
    </div>
  );
}
