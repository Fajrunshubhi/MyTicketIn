"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/ui/LoadingState";
import { Alert } from "@/components/ui/Alert";
import { ApplicationForm } from "@/components/organizer/ApplicationForm";
import { Icon } from "@/components/ui/Icon";

export default function OrganizerApplyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);

  useEffect(() => {
    fetch("/api/organizer/application", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login?callbackUrl=/dashboard/organizer/apply");
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
    <div className="mx-auto max-w-5xl">
      <p className="text-sm text-ink/65">
        Lengkapi data penyelenggara, foto KTP, selfie, dan rekening agar admin dapat meninjau akses ke workspace event. Formulir yang sama juga tersedia di Edit profil.
      </p>
      {loading ? (
        <div className="mt-6">
          <LoadingState />
        </div>
      ) : null}
      {exists ? (
        <div className="mt-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <Icon name="info" className="h-5 w-5 text-gold-600" />
            Pengajuan sudah tercatat
          </p>
          <p className="mt-2 text-sm text-ink/70">
            Satu akun hanya memiliki satu pengajuan. Lanjutkan ke halaman status untuk melihat keputusan admin.
          </p>
          <Link
            href="/dashboard/organizer/status"
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-gold-500 px-4 text-sm font-semibold text-white"
          >
            Buka status pengajuan
          </Link>
        </div>
      ) : null}
      {!loading && !exists ? (
        <div className="mt-6">
          <ApplicationForm mode="create" onDone={() => router.push("/dashboard/organizer/status")} />
        </div>
      ) : null}
    </div>
  );
}
