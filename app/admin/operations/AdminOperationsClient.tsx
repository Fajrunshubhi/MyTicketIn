"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Container } from "@/components/ui/Container";
import { LoadingState } from "@/components/ui/LoadingState";
import { OfflineState } from "@/components/shared/OfflineState";
import { readApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

const QUEUES = [
  { id: "moderation", label: "Moderasi" },
  { id: "late-payment", label: "Pembayaran terlambat" },
  { id: "mismatch", label: "Mismatch" },
  { id: "cancellation", label: "Pembatalan" },
  { id: "refund", label: "Refund" },
] as const;

type Item = {
  entityType: string;
  entityId: string;
  reasonCode: string;
  status: string;
  occurredAt: string;
  safeSummary: string;
};

function detailHref(item: Item): string {
  if (item.entityType === "OrganizerProfile") return `/admin/organizers/${item.entityId}`;
  if (item.entityType === "Event") return `/admin/events/${item.entityId}`;
  if (item.entityType === "PaymentReconciliation") return "/admin/payment-reconciliations";
  if (item.entityType === "Refund") return "/admin/refunds";
  return "/admin/payment-reconciliations";
}

export default function AdminOperationsClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const queue = sp.get("queue") || "moderation";
  const [items, setItems] = useState<Item[]>([]);
  const [asOf, setAsOf] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<{ backupFreshness?: string; alerts?: string[]; requestErrorRate?: number } | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/operations?queue=${encodeURIComponent(queue)}`, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace("/login?callbackUrl=/admin/operations");
          return;
        }
        if (res.status === 403) {
          router.replace("/dashboard");
          return;
        }
        if (!res.ok) {
          setError(readApiError(body, "Gagal memuat antrean."));
          setLoading(false);
          return;
        }
        setItems((body.data?.items || []) as Item[]);
        setAsOf(body.data?.countsAsOf || "");
        setError("");
        setLoading(false);
      })
      .catch(() => {
        setError("Tidak dapat terhubung ke layanan.");
        setLoading(false);
      });
    fetch("/api/admin/operations/health", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const body = await res.json().catch(() => ({}));
        setHealth(body.data || null);
      })
      .catch(() => setOffline(true));
  }, [queue, router]);

  return (
    <div>
      <Container>
        <p className="mb-2 text-sm text-gold-800">SANDBOX / OPERASI UJI</p>
        <p className="text-ink/65">Hanya daftar dan tautan. Mutasi tetap di modul pemilik masing-masing. Angka health teragregasi, tanpa log mentah.</p>
        {offline ? <div className="mt-4"><OfflineState /></div> : null}
        {health ? (
          <p className="mt-4 text-sm text-ink/60" aria-live="polite">
            Backup: {health.backupFreshness || "unknown"}. Error rate: {health.requestErrorRate ?? 0}.
            Alert: {(health.alerts && health.alerts.length > 0) ? health.alerts.join(", ") : "tidak ada"}.
          </p>
        ) : null}
        <nav className="mt-6 flex flex-wrap gap-3" aria-label="Jenis antrean">
          {QUEUES.map((q) => (
            <Link
              key={q.id}
              href={`/admin/operations?queue=${q.id}`}
              className={`rounded-full border px-4 py-2 text-sm ${queue === q.id ? "border-gold-400 text-gold-800" : "border-stone-200 text-ink/70"}`}
              aria-current={queue === q.id ? "page" : undefined}
            >
              {q.label}
            </Link>
          ))}
        </nav>
        {loading ? <div className="mt-6"><LoadingState /></div> : null}
        {error ? <div className="mt-6"><Alert tone="error" title={error} /></div> : null}
        {asOf ? <p className="mt-4 text-sm text-ink/45">Per {formatDateTime(asOf)}</p> : null}
        <ul className="mt-6 grid gap-3">
          {items.map((item) => (
            <li key={`${item.entityType}-${item.entityId}`} className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="font-semibold text-ink">{item.safeSummary}</p>
              <p className="mt-1 text-sm text-ink/65">{item.reasonCode} · {item.status} · {formatDateTime(item.occurredAt)}</p>
              <p className="mt-2">
                <Link className="text-gold-700 underline" href={detailHref(item)}>Buka detail</Link>
              </p>
            </li>
          ))}
        </ul>
        {!loading && items.length === 0 && !error ? (
          <p className="mt-6 text-ink/65">Tidak ada kasus pada antrean ini.</p>
        ) : null}
      </Container>
    </div>
  );
}
