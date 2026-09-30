"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { apiFetch, readApiError } from "@/lib/api";
import { formatRupiah } from "@/lib/format";
import { RefundTimeline } from "@/components/refunds/RefundTimeline";
import { refundStatusUiLabel, refundTimeline } from "@/lib/order-refund-display";

type Refund = {
  id: string;
  refundNumber: string;
  orderId: string;
  orderNumber?: string;
  eventTitle?: string;
  amountRupiah: number;
  reason: string;
  status: string;
  source?: string;
  requestedAt?: string | null;
  decidedAt?: string | null;
  transferDueAt?: string | null;
  completedAt?: string | null;
  decisionReason?: string | null;
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  hasTransferProof?: boolean;
};

function holdLabel(due?: string | null) {
  if (!due) return "Unggah bukti transfer untuk menyelesaikan.";
  const ms = new Date(due).getTime() - Date.now();
  if (ms <= 0) return "Batas 1×24 jam terlewati. Tetap unggah bukti agar status pembeli selesai.";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `Hold transfer: sisa ${h} jam ${m} menit.`;
}

export function OrganizerRefundsClient() {
  const search = useSearchParams();
  const focusId = search.get("refund") || "";
  const [items, setItems] = useState<Refund[]>([]);
  const [reason, setReason] = useState("Keputusan penyelenggara untuk refund sandbox uji.");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [proof, setProof] = useState<File | null>(null);
  const [busyId, setBusyId] = useState("");

  function load() {
    fetch("/api/organizer/refunds", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(readApiError(body, "Gagal memuat refund."));
          setLoading(false);
          return;
        }
        setItems((body.data?.items || []) as Refund[]);
        setError("");
        setLoading(false);
      })
      .catch(() => {
        setError("Tidak dapat terhubung ke layanan.");
        setLoading(false);
      });
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`refund-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, items]);

  const focused = useMemo(() => items.find((item) => item.id === focusId), [items, focusId]);

  async function decide(refundId: string, decision: string) {
    setError("");
    setBusyId(refundId);
    const res = await apiFetch(`/api/organizer/refunds/${refundId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason }),
    });
    const body = await res.json().catch(() => ({}));
    setBusyId("");
    if (!res.ok) {
      setError(readApiError(body, "Gagal memutus refund."));
      return;
    }
    setMessage(
      decision === "REJECT"
        ? `Refund ${body.data?.refund?.refundNumber} ditolak. Pembeli menerima alasan Anda.`
        : `Refund ${body.data?.refund?.refundNumber} disetujui. Unggah bukti transfer dalam 1×24 jam.`,
    );
    load();
  }

  async function uploadProof(refundId: string) {
    if (!proof) {
      setError("Pilih foto bukti transfer.");
      return;
    }
    setError("");
    setBusyId(refundId);
    const form = new FormData();
    form.append("proof", proof);
    const res = await apiFetch(`/api/organizer/refunds/${refundId}/transfer`, { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    setBusyId("");
    if (!res.ok) {
      setError(readApiError(body, "Gagal mengunggah bukti."));
      return;
    }
    setMessage(`Bukti transfer ${body.data?.refund?.refundNumber} terkirim. Status pembeli menjadi selesai.`);
    setProof(null);
    load();
  }

  return (
    <div>
      <p className="mb-4 text-sm text-gold-800">SANDBOX / TRANSAKSI UJI · bukti transfer arsip, bukan payout produksi</p>
      <h1 className="font-display text-3xl text-ink">Refund event Anda</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink/65">
        Periksa rekening pembeli, setujui atau tolak dengan penjelasan. Setelah disetujui, transfer (uji) boleh ditahan
        1×24 jam lalu unggah bukti agar riwayat pembeli selesai.
      </p>
      {error ? (
        <div className="mt-4">
          <Alert tone="error" title={error} />
        </div>
      ) : null}
      {message ? (
        <div className="mt-4">
          <Alert tone="info" title={message} />
        </div>
      ) : null}
      {focused && focused.status === "REQUESTED" ? (
        <p className="mt-4 text-sm text-ink/70">Membuka {focused.refundNumber}. Isi alasan lalu setujui atau tolak.</p>
      ) : null}
      <label className="mt-6 block max-w-xl text-sm">
        Alasan keputusan (minimal 10 karakter)
        <textarea
          className="mt-1 w-full rounded-xl border border-stone-200 bg-white p-2"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          minLength={10}
        />
      </label>
      {loading ? <p className="mt-6 text-sm text-ink/55">Memuat pengajuan…</p> : null}
      <ul className="mt-6 space-y-4">
        {items.map((item) => (
          <li
            id={`refund-${item.id}`}
            key={item.id}
            className={`rounded-3xl border bg-white p-5 ${
              item.id === focusId ? "border-gold-400 ring-2 ring-gold-200" : "border-stone-200"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">
                  {item.refundNumber} · {refundStatusUiLabel(item.status)}
                </p>
                <p className="mt-1 text-sm text-ink/65">
                  {item.eventTitle || "Event"} · order {item.orderNumber || item.orderId} · {formatRupiah(item.amountRupiah)}
                </p>
              </div>
            </div>
            <p className="mt-2 text-sm text-ink/70">{item.reason}</p>
            {item.bankName ? (
              <div className="mt-3 rounded-2xl bg-[#f7f5fc] px-4 py-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Rekening tujuan</p>
                <p className="mt-1 font-medium text-ink">
                  {item.bankName} · {item.accountName}
                </p>
                <p className="font-mono text-ink">{item.accountNumber}</p>
              </div>
            ) : null}
            <RefundTimeline steps={refundTimeline(item)} />
            {item.status === "REQUESTED" ? (
              <p className="mt-3 flex flex-wrap gap-3 text-sm">
                <button
                  type="button"
                  className="font-medium text-gold-700 underline-offset-2 hover:underline"
                  disabled={busyId === item.id}
                  onClick={() => void decide(item.id, "APPROVE")}
                >
                  Setujui (tahan transfer 24 jam)
                </button>
                <button
                  type="button"
                  className="font-medium text-ink/70 underline-offset-2 hover:underline"
                  disabled={busyId === item.id}
                  onClick={() => void decide(item.id, "REJECT")}
                >
                  Tolak dengan alasan
                </button>
              </p>
            ) : null}
            {item.status === "APPROVED" || item.status === "PROCESSING" ? (
              <div className="mt-4 space-y-3 rounded-2xl border border-dashed border-gold-300 bg-gold-50/40 p-4">
                <p className="text-sm font-medium text-gold-900">{holdLabel(item.transferDueAt)}</p>
                <label className="block text-sm">
                  Foto bukti transfer
                  <input
                    className="mt-1 block w-full text-sm"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setProof(e.target.files?.[0] || null)}
                  />
                </label>
                <Button type="button" loading={busyId === item.id} disabled={busyId === item.id} onClick={() => void uploadProof(item.id)}>
                  Kirim bukti ke pembeli
                </Button>
              </div>
            ) : null}
            {item.hasTransferProof ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/organizer/refunds/${item.id}/proof`}
                alt={`Bukti transfer ${item.refundNumber}`}
                className="mt-4 max-h-48 rounded-2xl border border-stone-200 object-contain"
              />
            ) : null}
          </li>
        ))}
      </ul>
      {!loading && items.length === 0 ? <p className="mt-6 text-sm text-ink/55">Belum ada pengajuan refund.</p> : null}
    </div>
  );
}
