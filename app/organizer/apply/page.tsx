"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { LoadingState } from "@/components/ui/LoadingState";
import { Alert } from "@/components/ui/Alert";
import { ApplicationForm } from "@/components/organizer/ApplicationForm";

export default function OrganizerApplyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);

  useEffect(() => {
    fetch("/api/organizer/application", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login?callbackUrl=/organizer/apply");
          return;
        }
        if (res.ok) {
          setExists(true);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  return (
    <div>
      <Container>
        <h1 className="font-display text-3xl text-ink">Ajukan profil organizer</h1>
        <p className="mt-2 max-w-2xl text-ink/65">
          Isi nama, kontak, dan deskripsi. Tidak ada unggahan KYC atau data rekening pada MVP.
        </p>
        {loading ? <div className="mt-6"><LoadingState /></div> : null}
        {exists ? (
          <div className="mt-6">
            <Alert tone="info" title="Pengajuan sudah ada">
              Lihat status di halaman status organizer.
            </Alert>
            <p className="mt-4">
              <Link className="text-gold-700 underline-offset-2 hover:underline" href="/organizer/status">
                Buka status pengajuan
              </Link>
            </p>
          </div>
        ) : null}
        {!loading && !exists ? (
          <div className="mt-6">
            <ApplicationForm mode="create" onDone={() => router.push("/organizer/status")} />
          </div>
        ) : null}
      </Container>
    </div>
  );
}
