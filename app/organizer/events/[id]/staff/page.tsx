"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/shared/AppHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { FormSection } from "@/components/ui/FormSection";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { apiFetch, readApiError } from "@/lib/api";

type Candidate = { id: string; displayName: string; username: string };
type Assignment = { id: string; displayName: string; username: string; status: string; version: number };

export default function EventStaffPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const embedded = pathname.startsWith("/dashboard");
  const eventHref = `/dashboard/event/${params.id}`;
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [userId, setUserId] = useState("");
  const [staff, setStaff] = useState<Assignment[]>([]);
  const [error, setError] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadStaff() {
    const res = await apiFetch(`/api/organizer/events/${params.id}/staff`);
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
  }

  async function loadCandidates() {
    const res = await apiFetch(`/api/organizer/staff-candidates`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setCandidates((body.data?.items || []) as Candidate[]);
  }

  useEffect(() => {
    void loadStaff();
    void loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function assign(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!userId) {
      setError("Pilih akun petugas yang sudah Anda buat.");
      return;
    }
    setBusy(true);
    const res = await apiFetch(`/api/organizer/events/${params.id}/staff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(readApiError(body, "Penugasan gagal."));
      return;
    }
    await loadStaff();
  }

  async function revoke(id: string, version: number) {
    setBusy(true);
    const res = await apiFetch(`/api/organizer/events/${params.id}/staff/${id}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: revokeReason, expectedVersion: version }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(readApiError(body, "Pencabutan gagal."));
      return;
    }
    await loadStaff();
  }

  const inner = (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-ink">Petugas event</h1>
        <p className="mt-2 text-sm text-ink/65">
          Pilih akun petugas yang Anda buat di{" "}
          <Link className="text-gold-700 underline" href="/dashboard/petugas">
            Akun petugas
          </Link>
          . Bukan akun pembeli. Pencabutan berlaku pada pemindaian berikutnya.
        </p>
      </div>
      {error ? <Alert tone="error" title="Gagal">{error}</Alert> : null}

      <form onSubmit={assign}>
        <FormSection title="Tugaskan ke event ini" description="Hanya akun petugas milik penyelenggara Anda.">
          <Select label="Akun petugas" name="userId" value={userId} onChange={(e) => setUserId(e.target.value)} required>
            <option value="">Pilih petugas</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName} (@{c.username})
              </option>
            ))}
          </Select>
          <div className="flex items-end">
            <Button type="submit" loading={busy}>
              Tugaskan
            </Button>
          </div>
        </FormSection>
      </form>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-ink">Penugasan</h2>
        <div className="mt-4 max-w-xl">
          <Input
            label="Alasan cabut akses (min. 10 karakter)"
            name="revokeReason"
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
          />
        </div>
        <ul className="mt-4 space-y-2">
          {staff.length === 0 ? <li className="text-sm text-ink/60">Belum ada petugas pada event ini.</li> : null}
          {staff.map((s) => (
            <li key={s.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 p-3">
              <span>
                {s.displayName} · @{s.username} · {s.status === "ACTIVE" ? "Aktif" : "Dicabut"}
              </span>
              {s.status === "ACTIVE" ? (
                <Button type="button" variant="danger" loading={busy} onClick={() => void revoke(s.id, s.version)}>
                  Cabut
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
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
