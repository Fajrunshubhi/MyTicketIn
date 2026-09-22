"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { AppHeader } from "@/components/shared/AppHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Input } from "@/components/ui/Input";
import { apiFetch, readApiError } from "@/lib/api";

type Candidate = { id: string; displayName: string; maskedEmail: string };
type Assignment = { id: string; displayName: string; maskedEmail: string; status: string; version: number };

export default function EventStaffPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const embedded = pathname.startsWith("/dashboard");
  const eventHref = `/dashboard/event/${params.id}`;
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [staff, setStaff] = useState<Assignment[]>([]);
  const [error, setError] = useState("");
  const [revokeReason, setRevokeReason] = useState("");

  function loadStaff() {
    fetch(`/api/organizer/events/${params.id}/staff`, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace(`/login?callbackUrl=${encodeURIComponent(`${eventHref}/staff`)}&portal=organizer`);
          return;
        }
        if (!res.ok) {
          setError(readApiError(body, "Gagal memuat petugas."));
          return;
        }
        setStaff((body.data?.items || []) as Assignment[]);
      })
      .catch(() => setError("Tidak dapat terhubung ke layanan."));
  }

  useEffect(() => {
    loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function search(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch(`/api/organizer/staff-candidates?q=${encodeURIComponent(q)}`, { credentials: "include", cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(readApiError(body, "Pencarian gagal."));
      return;
    }
    setCandidates((body.data?.items || []) as Candidate[]);
  }

  async function assign(userId: string) {
    const res = await apiFetch(`/api/organizer/events/${params.id}/staff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(readApiError(body, "Penugasan gagal."));
      return;
    }
    loadStaff();
  }

  async function revoke(id: string, version: number) {
    const res = await apiFetch(`/api/organizer/events/${params.id}/staff/${id}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: revokeReason, expectedVersion: version }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(readApiError(body, "Pencabutan gagal."));
      return;
    }
    loadStaff();
  }

  const inner = (
    <>
      <h1 className="font-display text-3xl text-ink">Petugas event</h1>
      <p className="mt-2 text-ink/65">Owner organizer tetap operator. Pencabutan berlaku pada permintaan berikutnya.</p>
      {error ? <div className="mt-4"><Alert tone="error" title="Gagal">{error}</Alert></div> : null}
      <form onSubmit={search} className="mt-6 flex max-w-xl flex-col gap-3 sm:flex-row">
        <Input label="Cari akun (min. 3 huruf)" name="q" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" className="sm:mt-6">Cari</Button>
      </form>
      <ul className="mt-4 space-y-2">
        {candidates.map((c) => (
          <li key={c.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border border-stone-200 p-3">
            <span>{c.displayName} · {c.maskedEmail}</span>
            <Button type="button" onClick={() => assign(c.id)}>Tugaskan</Button>
          </li>
        ))}
      </ul>
      <h2 className="font-display mt-8 text-2xl text-ink">Daftar penugasan</h2>
      <Input label="Alasan cabut akses" name="revokeReason" value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} />
      <ul className="mt-4 space-y-2">
        {staff.map((s) => (
          <li key={s.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border border-stone-200 p-3">
            <span>{s.displayName} · {s.maskedEmail} · {s.status === "ACTIVE" ? "Aktif" : "Dicabut"}</span>
            {s.status === "ACTIVE" ? <Button type="button" onClick={() => revoke(s.id, s.version)}>Cabut</Button> : null}
          </li>
        ))}
      </ul>
    </>
  );

  if (embedded) {
    return <div>{inner}</div>;
  }

  return (
    <main id="main-content" className="auth-shell min-h-screen">
      <AppHeader homeHref="/dashboard" items={[{ href: eventHref, label: "Kembali ke event" }]} />
      <Container>{inner}</Container>
    </main>
  );
}
