"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Container } from "@/components/ui/Container";
import { apiFetch, readApiError } from "@/lib/api";

type Row = {
  id: string;
  orderNumber: string;
  paymentId: string;
  reasonCode: string;
  createdAt: string;
  status: string;
};

export default function AdminReconPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/admin/payment-reconciliations?status=OPEN", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace("/login?callbackUrl=/admin/payment-reconciliations");
          return;
        }
        if (res.status === 403) {
          setError("Hanya admin yang dapat membuka antrean ini.");
          return;
        }
        if (!res.ok) {
          setError(readApiError(body, "Gagal memuat rekonsiliasi."));
          return;
        }
        setRows((body.data?.items || []) as Row[]);
      })
      .catch(() => setError("Tidak dapat terhubung ke layanan."));
  }, [router]);

  async function resolve(id: string, decision: string) {
    const res = await apiFetch(`/api/admin/payment-reconciliations/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": `recon-${id}-${decision}` },
      body: JSON.stringify({ decision, notes: notes[id] || "Penyelesaian administratif sandbox oleh admin." }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(readApiError(body, "Gagal menyelesaikan kasus."));
      return;
    }
    setRows((cur) => (cur || []).filter((r) => r.id !== id));
  }

  return (
    <div>
      <Container>
        <p className="mb-4 text-sm text-gold-800">SANDBOX / TRANSAKSI UJI</p>
        <h1 className="font-display text-3xl text-ink">Rekonsiliasi pembayaran</h1>
        {error ? <Alert tone="error" title={error} /> : null}
        <ul className="mt-6 space-y-4">
          {(rows || []).map((row) => (
            <li key={row.id} className="rounded-2xl border border-stone-200 p-4">
              <p>{row.orderNumber} · {row.reasonCode}</p>
              <p className="text-sm text-ink/60">{row.createdAt} · {row.status}</p>
              <label className="mt-2 block text-sm">
                Alasan keputusan
                <textarea className="mt-1 w-full rounded bg-white p-2" value={notes[row.id] || ""} onChange={(e) => setNotes((s) => ({ ...s, [row.id]: e.target.value }))} />
              </label>
              <div className="mt-2 flex gap-3">
                <button type="button" className="text-gold-700 underline" onClick={() => resolve(row.id, "REJECT")}>Tolak</button>
                <button type="button" className="text-gold-700 underline" onClick={() => resolve(row.id, "ACCEPT_REFUND_SANDBOX")}>Refund sandbox</button>
              </div>
            </li>
          ))}
        </ul>
        {rows && rows.length === 0 ? <p className="mt-6 text-ink/60">Tidak ada kasus terbuka.</p> : null}
      </Container>
    </div>
  );
}
