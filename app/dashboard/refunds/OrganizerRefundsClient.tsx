"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { MidtransRefundNote, RefundInbox } from "@/components/refunds/RefundInbox";
import { RefundTimeline } from "@/components/refunds/RefundTimeline";
import { apiFetch, readApiError } from "@/lib/api";
import { formatRupiah } from "@/lib/format";
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
  viaMidtrans?: boolean;
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
  const [selectedId, setSelectedId] = useState(focusId);
  const [filter, setFilter] = useState("open");

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
    if (focusId) {
      setSelectedId(focusId);
      setFilter("all");
    }
  }, [focusId]);

  const visible = useMemo(() => {
    if (filter === "open") return items.filter((i) => i.status !== "COMPLETED" && i.status !== "REJECTED");
    if (filter === "done") return items.filter((i) => i.status === "COMPLETED" || i.status === "REJECTED");
    return items;
  }, [items, filter]);
  const selected = visible.find((i) => i.id === selectedId) || items.find((i) => i.id === selectedId);

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
        ? `Refund ${body.data?.refund?.refundNumber} ditolak.`
        : `Refund ${body.data?.refund?.refundNumber} disetujui.`,
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
    setMessage(`Bukti transfer ${body.data?.refund?.refundNumber} terkirim.`);
    setProof(null);
    load();
  }

  async function retryMidtrans(refundId: string) {
    setError("");
    setBusyId(refundId);
    const res = await apiFetch(`/api/organizer/refunds/${refundId}/transfer`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusyId("");
    if (!res.ok) {
      setError(readApiError(body, "Gagal mengirim ulang refund Midtrans."));
      return;
    }
    setMessage(`Refund ${body.data?.refund?.refundNumber} dikirim ulang ke Midtrans.`);
    load();
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="mb-2 text-sm text-gold-800">Refund pembeli · payout organizer tetap manual</p>
        <h1 className="font-display text-3xl text-ink">Refund event Anda</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/65">
          Setujui atau tolak dengan penjelasan. QRIS dan e-wallet Midtrans dikembalikan ke sumber bayar. Virtual account
          menahan transfer 1×24 jam lalu unggah bukti.
        </p>
      </header>
      {error ? <Alert tone="error" title={error} /> : null}
      {message ? <Alert tone="info" title={message} /> : null}
      <MidtransRefundNote />
      {loading ? <p className="text-sm text-ink/55">Memuat pengajuan…</p> : null}
      <RefundInbox
        items={visible}
        selectedId={selected?.id || ""}
        onSelect={setSelectedId}
        filters={[
          { id: "open", label: "Perlu tindakan" },
          { id: "done", label: "Selesai" },
          { id: "all", label: "Semua" },
        ]}
        activeFilter={filter}
        onFilter={setFilter}
        emptyLabel="Belum ada pengajuan refund."
        detail={
          selected ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink/45">{selected.refundNumber}</p>
              <h3 className="mt-1 text-xl font-semibold text-ink">{selected.eventTitle || "Event"}</h3>
              <p className="mt-1 text-sm text-ink/60">
                Order {selected.orderNumber || selected.orderId} · {formatRupiah(selected.amountRupiah)} ·{" "}
                {refundStatusUiLabel(selected.status, selected.viaMidtrans)}
              </p>
              <p className="mt-3 text-sm text-ink/70">{selected.reason}</p>
              {selected.bankName && !selected.viaMidtrans ? (
                <div className="mt-3 rounded-2xl bg-[#f7f5fc] px-4 py-3 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Rekening tujuan</p>
                  <p className="mt-1 font-medium text-ink">
                    {selected.bankName} · {selected.accountName}
                  </p>
                  <p className="font-mono text-ink">{selected.accountNumber}</p>
                </div>
              ) : null}
              <div className="mt-4">
                <RefundTimeline steps={refundTimeline(selected)} />
              </div>
              <label className="mt-4 block text-sm">
                Alasan keputusan (minimal 10 karakter)
                <textarea
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-white p-2"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  minLength={10}
                />
              </label>
              {selected.status === "REQUESTED" ? (
                <p className="mt-3 flex flex-wrap gap-3 text-sm">
                  <Button type="button" loading={busyId === selected.id} onClick={() => void decide(selected.id, "APPROVE")}>
                    {selected.viaMidtrans ? "Setujui (refund Midtrans)" : "Setujui (tahan transfer 24 jam)"}
                  </Button>
                  <Button type="button" variant="secondary" loading={busyId === selected.id} onClick={() => void decide(selected.id, "REJECT")}>
                    Tolak
                  </Button>
                </p>
              ) : null}
              {selected.viaMidtrans && (selected.status === "APPROVED" || selected.status === "PROCESSING" || selected.status === "FAILED") ? (
                <div className="mt-4 space-y-3 rounded-2xl border border-dashed border-gold-300 bg-gold-50/40 p-4">
                  <p className="text-sm font-medium text-gold-900">
                    {selected.status === "FAILED"
                      ? "Pengembalian Midtrans gagal. Kirim ulang tanpa unggah bukti."
                      : "Dana dikembalikan ke sumber pembayaran Midtrans. Tidak perlu bukti transfer."}
                  </p>
                  {selected.status === "FAILED" ? (
                    <Button type="button" loading={busyId === selected.id} onClick={() => void retryMidtrans(selected.id)}>
                      Kirim ulang ke Midtrans
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {!selected.viaMidtrans && (selected.status === "APPROVED" || selected.status === "PROCESSING" || selected.status === "FAILED") ? (
                <div className="mt-4 space-y-3 rounded-2xl border border-dashed border-gold-300 bg-gold-50/40 p-4">
                  <p className="text-sm font-medium text-gold-900">
                    {selected.status === "FAILED"
                      ? "Virtual account tidak bisa di-refund lewat Midtrans. Unggah bukti transfer ke rekening pembeli."
                      : holdLabel(selected.transferDueAt)}
                  </p>
                  <label className="block text-sm">
                    Bukti transfer
                    <input
                      className="mt-1 block w-full text-sm"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => setProof(e.target.files?.[0] || null)}
                    />
                  </label>
                  <Button type="button" loading={busyId === selected.id} onClick={() => void uploadProof(selected.id)}>
                    Kirim bukti ke pembeli
                  </Button>
                </div>
              ) : null}
              {selected.hasTransferProof ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/organizer/refunds/${selected.id}/proof`}
                  alt={`Bukti transfer ${selected.refundNumber}`}
                  className="mt-4 max-h-48 rounded-2xl border border-stone-200 object-contain"
                />
              ) : null}
            </div>
          ) : null
        }
      />
    </div>
  );
}
