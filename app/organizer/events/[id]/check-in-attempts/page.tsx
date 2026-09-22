"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { AppHeader } from "@/components/shared/AppHeader";
import { Alert } from "@/components/ui/Alert";
import { Container } from "@/components/ui/Container";
import { readApiError } from "@/lib/api";

type Row = {
  id: string;
  result: string;
  reasonCode: string;
  attemptedAt: string;
  firstUsedAt?: string;
  ticketNumberMasked?: string;
  operatorName: string;
};

export default function CheckInAttemptsPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const embedded = pathname.startsWith("/dashboard");
  const eventHref = `/dashboard/event/${params.id}`;
  const [items, setItems] = useState<Row[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/events/${params.id}/check-in-attempts`, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(readApiError(body, "Riwayat tidak dapat dimuat."));
          return;
        }
        setItems(((body.data as { items?: Row[] })?.items || []));
      })
      .catch(() => setError("Tidak dapat terhubung ke layanan."));
  }, [params.id]);

  const inner = (
    <>
      <h1 className="font-display text-3xl text-ink">Riwayat check-in</h1>
      {error ? <div className="mt-4"><Alert tone="error" title={error} /></div> : null}
      {items.length === 0 && !error ? <p className="mt-4 text-ink/65">Belum ada percobaan.</p> : null}
      <ul className="mt-6 space-y-3">
        {items.map((it) => (
          <li key={it.id} className="rounded-xl border border-stone-200 p-4">
            <p className="font-semibold text-ink">{it.result} · {it.reasonCode}</p>
            <p className="text-sm text-ink/70">
              {it.operatorName} · {it.attemptedAt}
              {it.ticketNumberMasked ? ` · ${it.ticketNumberMasked}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </>
  );

  if (embedded) {
    return <div>{inner}</div>;
  }

  return (
    <main id="konten-utama" className="auth-shell min-h-screen">
      <AppHeader
        homeHref="/dashboard"
        items={[{ href: `${eventHref}/scanner`, label: "Scanner" }]}
        showLogout
      />
      <Container>{inner}</Container>
    </main>
  );
}
