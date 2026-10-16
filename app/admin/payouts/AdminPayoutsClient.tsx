"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { apiFetch, readApiError } from "@/lib/api";
import { formatDateTime, formatRupiah } from "@/lib/format";
import { adminPayoutReportHref } from "@/lib/payout-report";

type Payout = {
  id: string;
  payoutNumber: string;
  organizerName?: string;
  eventTitle?: string;
  amountRupiah: number;
  status: "REQUESTED" | "PAID" | "REJECTED";
  bankName: string;
  accountName: string;
  accountNumber: string;
  requestedAt: string | null;
  paidAt: string | null;
  decisionReason: string | null;
  hasTransferProof: boolean;
};

const FILTERS = [
  { id: "REQUESTED", label: "Menunggu transfer" },
  { id: "PAID", label: "Sudah dicairkan" },
  { id: "REJECTED", label: "Ditolak" },
  { id: "", label: "Semua" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Menunggu transfer",
  PAID: "Sudah dicairkan",
  REJECTED: "Ditolak",
};

export default function AdminPayoutsClient() {
  const [filter, setFilter] = useState<string>("REQUESTED");
  const [items, setItems] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const [proofs, setProofs] = useState<Record<string, File | null>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});

  async function load(status = filter) {
    setLoading(true);
    const res = await fetch(`/api/admin/payouts${status ? `?status=${status}` : ""}`, {
      credentials: "include",
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(readApiError(body, "Gagal memuat pencairan."));
      return;
    }
    setError("");
    setItems((body.data?.items || []) as Payout[]);
  }

  useEffect(() => {
    void load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function transfer(id: string) {
    const proof = proofs[id];
    if (!proof) {
      setError("Unggah bukti transfer terlebih dahulu.");
      return;
    }
    setBusyId(id);
    setError("");
    setMessage("");
    const form = new FormData();
    form.append("proof", proof);
    const res = await apiFetch(`/api/admin/payouts/${id}/transfer`, { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    setBusyId("");
    if (!res.ok) {
      setError(readApiError(body, "Pencairan gagal dicatat."));
      return;
    }
    setMessage("Pencairan ditandai sudah ditransfer. Penyelenggara diberi tahu.");
    await load();
  }

  async function reject(id: string) {
    setBusyId(id);
    setError("");
    setMessage("");
    const res = await apiFetch(`/api/admin/payouts/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reasons[id] || "" }),
    });
    const body = await res.json().catch(() => ({}));
    setBusyId("");
    if (!res.ok) {
      setError(readApiError(body, "Pencairan gagal ditolak."));
      return;
    }
    setMessage("Pencairan ditolak. Penyelenggara dapat mengajukan ulang.");
    await load();
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink/70">
        Semua pembayaran pembeli masuk ke akun platform. Setelah event selesai dan masa tahan lewat, penyelenggara
        mengajukan pencairan; di sini admin mentransfer ke rekening terdaftar lalu mengunggah bukti. Periksa laporan
        pendukung (PDF atau Excel) sebelum mentransfer.
      </p>
      <div role="group" aria-label="Filter status" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id || "all"}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`min-h-11 rounded-full px-4 text-sm font-medium ${
              filter === f.id ? "bg-gold-500 text-white" : "bg-white text-ink/70"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {error ? <Alert tone="error" title={error} /> : null}
      {message ? <Alert tone="success" title={message} /> : null}
      {loading ? <p className="text-sm text-ink/60">Memuat…</p> : null}
      {!loading && items.length === 0 ? <p className="text-sm text-ink/60">Tidak ada pencairan.</p> : null}

      <ul className="space-y-4">
        {items.map((p) => (
          <li key={p.id} className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">{p.payoutNumber}</p>
                <p className="font-semibold text-ink">{p.eventTitle}</p>
                <p className="text-sm text-ink/65">{p.organizerName}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-ink">{formatRupiah(p.amountRupiah)}</p>
                <p className="text-xs text-ink/60">{STATUS_LABEL[p.status]}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <a className="text-sm text-gold-700 underline" href={adminPayoutReportHref(p.id, "pdf")}>
                Unduh laporan PDF
              </a>
              <a className="text-sm text-gold-700 underline" href={adminPayoutReportHref(p.id, "csv")}>
                Unduh laporan Excel
              </a>
            </div>
            <dl className="mt-3 grid gap-1 text-sm text-ink/75 sm:grid-cols-2">
              <div>
                <dt className="inline text-ink/50">Bank: </dt>
                <dd className="inline">{p.bankName}</dd>
              </div>
              <div>
                <dt className="inline text-ink/50">Atas nama: </dt>
                <dd className="inline">{p.accountName}</dd>
              </div>
              <div>
                <dt className="inline text-ink/50">No. rekening: </dt>
                <dd className="inline font-mono">{p.accountNumber}</dd>
              </div>
              <div>
                <dt className="inline text-ink/50">Diajukan: </dt>
                <dd className="inline">{p.requestedAt ? formatDateTime(p.requestedAt) : "—"}</dd>
              </div>
            </dl>

            {p.status === "REQUESTED" ? (
              <div className="mt-4 space-y-3 border-t border-stone-100 pt-4">
                <label className="block text-sm text-ink/80">
                  Bukti transfer (gambar)
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="mt-1 block w-full text-sm"
                    onChange={(e) => setProofs((cur) => ({ ...cur, [p.id]: e.target.files?.[0] || null }))}
                  />
                </label>
                <Button loading={busyId === p.id} disabled={busyId === p.id} onClick={() => void transfer(p.id)}>
                  Tandai sudah ditransfer
                </Button>
                <label className="block text-sm text-ink/80">
                  Alasan penolakan (min. 10 karakter)
                  <textarea
                    className="mt-1 block w-full rounded-md border border-stone-300 p-2"
                    rows={2}
                    value={reasons[p.id] || ""}
                    onChange={(e) => setReasons((cur) => ({ ...cur, [p.id]: e.target.value }))}
                  />
                </label>
                <Button
                  variant="secondary"
                  loading={busyId === p.id}
                  disabled={busyId === p.id}
                  onClick={() => void reject(p.id)}
                >
                  Tolak pencairan
                </Button>
              </div>
            ) : null}

            {p.status === "PAID" && p.hasTransferProof ? (
              <div className="mt-4 border-t border-stone-100 pt-4">
                <p className="text-sm text-ink/70">Dicairkan {p.paidAt ? formatDateTime(p.paidAt) : ""}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/admin/payouts/${p.id}/proof`}
                  alt={`Bukti transfer ${p.payoutNumber}`}
                  className="mt-2 max-h-64 rounded-lg border border-stone-200"
                />
              </div>
            ) : null}

            {p.status === "REJECTED" && p.decisionReason ? (
              <p className="mt-3 text-sm text-ink/70">Alasan: {p.decisionReason}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
