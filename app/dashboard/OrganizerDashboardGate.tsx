"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OrganizerWorkspace } from "@/components/dashboard/OrganizerWorkspace";
import { type AccountProfile } from "@/lib/account";

export function OrganizerDashboardGate() {
  const router = useRouter();
  const [me, setMe] = useState<AccountProfile | null>(null);

  useEffect(() => {
    fetch("/api/me", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          router.replace("/login?callbackUrl=/dashboard");
          return;
        }
        const body = (await res.json()) as { data?: AccountProfile };
        if (body.data) {
          setMe(body.data);
        }
      })
      .catch(() => router.replace("/login?callbackUrl=/dashboard"));
  }, [router]);

  if (!me) {
    return (
      <div className="px-6 py-10">
        <p role="status">Memuat dashboard penyelenggara…</p>
      </div>
    );
  }

  return <OrganizerWorkspace me={me} />;
}
