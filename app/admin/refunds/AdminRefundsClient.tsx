"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { MidtransRefundNote, RefundInbox } from "@/components/refunds/RefundInbox";
import { RefundTimeline } from "@/components/refunds/RefundTimeline";
import { apiFetch, readApiError } from "@/lib/api";
import { formatDateTime, formatRupiah } from "@/lib/format";
import {
  refundOversightLabel,
  refundSourceUiLabel,
  refundStatusUiLabel,
  refundTimeline,
  type RefundOversightFlag,
} from "@/lib/order-refund-display";

type Refund = {
  id: string;
  refundNumber: string;
  orderId: string;
  orderNumber?: string;
  eventId?: string;
  eventTitle?: string;
  organizerName?: string;
  organizerProfileId?: string;
  amountRupiah: number;
  reason: string;
  status: string;
  source?: string;
  requestedAt?: string | null;
  transferDueAt?: string | null;
  decisionReason?: string | null;
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  hasTransferProof?: boolean;
  oversightFlag?: RefundOversightFlag;
  viaMidtrans?: boolean;
};

type Summary = {
  attention: number;
  awaitingReview: number;
  awaitingTransfer: number;
  overdueTransfer: number;
  total: number;
};

const FILTERS: { id: string; label: string }[] = [
  { id: "attention", label: "Perlu eskalasi" },
  { id: "requested", label: "Menunggu penyelenggara" },
  { id: "transfer", label: "Menunggu transfer" },
  { id: "overdue", label: "Transfer terlambat" },
  { id: "done", label: "Selesai / ditolak" },
  { id: "all", label: "Semua" },
];

export default function AdminRefundsClient() {
  const search = useSearchParams();
  const focusId = search.get("refund") || "";
  const [items, setItems] = useState<Refund[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filter, setFilter] = useState("attention");
  const [reason, setReason] = useState("Eskalasi platform: penyelenggara tidak menyelesaikan sesuai SLA.");
  const [orderId, setOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [busyId, setBusyId] = useState("");
  const [selectedId, setSelectedId] = useState(focusId);

  function load() {
    fetch("/api/admin/refunds", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(readApiError(body, "Gagal memuat pengawasan refund."));
          return;
        }
        setItems((body.data?.items || []) as Refund[]);
        setSummary((body.data?.summary || null) as Summary | null);
        setError("");
      })
      .catch(() => setError("Tidak dapat terhubung ke layanan."));
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
    return items.filter((item) => {
      if (filter === "attention") return Boolean(item.oversightFlag);
      if (filter === "requested") return item.status === "REQUESTED";
      if (filter === "transfer") return item.status === "APPROVED" || item.status === "PROCESSING";
      if (filter === "overdue") return item.oversightFlag === "transfer_overdue";
      if (filter === "done") return item.status === "COMPLETED" || item.status === "REJECTED";
      return true;
    });
  }, [items, filter]);
  const selected = visible.find((i) => i.id === selectedId) || items.find((i) => i.id === selectedId);

  async function escalate(refundId: string, decision: string) {
    setError("");
    setBusyId(refundId);
    const res = await apiFetch(`/api/admin/refunds/${refundId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason }),
    });
    const body = await res.json().catch(() => ({}));
    setBusyId("");
    if (!res.ok) {
      setError(readApiError(body, "Eskalasi gagal."));
      return;
    }
    setMessage(`Eskalasi ${body.data?.refund?.refundNumber}: ${refundStatusUiLabel(String(body.data?.refund?.status || ""))}.`);
    load();
  }

  async function takeoverTransfer(refundId: string) {
    if (!proof) {
      setError("Unggah bukti transfer untuk menyelesaikan atas nama platform.");
      return;
    }
    setBusyId(refundId);
    const form = new FormData();
    form.append("proof", proof);
    const res = await apiFetch(`/api/admin/refunds/${refundId}/transfer`, { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    setBusyId("");
    if (!res.ok) {
      setError(readApiError(body, "Gagal mengunggah bukti eskalasi."));
      return;
    }
    setMessage(`Platform menyelesaikan ${body.data?.refund?.refundNumber}.`);
    setProof(null);
    load();
  }

  async function retryMidtrans(refundId: string) {
    setBusyId(refundId);
    const res = await apiFetch(`/api/admin/refunds/${refundId}/transfer`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusyId("");
    if (!res.ok) {
      setError(readApiError(body, "Gagal mengirim ulang refund Midtrans."));
      return;
    }
    setMessage(`Refund ${body.data?.refund?.refundNumber} dikirim ulang ke Midtrans.`);
    load();
  }

  async function createNote() {
    setError("");
    const res = await apiFetch("/api/admin/refunds", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": `refund-admin-${orderId}-${amount}` },
      body: JSON.stringify({ orderId, amountRupiah: Number(amount), reason: note }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(readApiError(body, "Gagal membuat catatan admin."));
      return;
    }
    setMessage(`Catatan admin ${body.data?.refund?.refundNumber} tersimpan.`);
    load();
  }

  const flagLabel = refundOversightLabel(selected?.oversightFlag || null);

  return (
    <div>
      <Container>
        <p className="mb-2 text-sm text-gold-800">SANDBOX · pengawasan platform · bukan pencairan uang</p>
        <h1 className="font-display text-3xl text-ink">Pengawasan refund</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink/65">
          Keputusan rutin milik penyelenggara. Admin mengawasi SLA, audit, dan eskalasi jika tinjauan &gt; 48 jam atau
          transfer lewat 24 jam.
        </p>

        {summary ? (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Perlu eskalasi", value: summary.attention, tone: "warn" },
              { label: "Menunggu penyelenggara", value: summary.awaitingReview, tone: "muted" },
              { label: "Menunggu transfer", value: summary.awaitingTransfer, tone: "muted" },
              { label: "Transfer terlambat", value: summary.overdueTransfer, tone: "warn" },
            ].map((card) => (
              <li
                key={card.label}
                className={`rounded-2xl border px-4 py-3 ${
                  card.tone === "warn" && card.value > 0 ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">{card.label}</p>
                <p className="mt-1 font-display text-2xl text-ink">{card.value}</p>
              </li>
            ))}
          </ul>
        ) : null}

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

        <div className="mt-6">
          <MidtransRefundNote />
        </div>

        <div className="mt-6">
          <RefundInbox
            items={visible}
            selectedId={selected?.id || ""}
            onSelect={setSelectedId}
            filters={FILTERS}
            activeFilter={filter}
            onFilter={setFilter}
            emptyLabel={
              filter === "attention" ? "Tidak ada kasus di luar SLA." : "Tidak ada item pada filter ini."
            }
            detail={
              selected ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink/45">{selected.refundNumber}</p>
                  <h3 className="mt-1 text-xl font-semibold text-ink">{selected.eventTitle || "Event"}</h3>
                  <p className="mt-1 text-sm text-ink/60">
                    {selected.organizerName} · {selected.orderNumber} · {formatRupiah(selected.amountRupiah)} ·{" "}
                    {refundSourceUiLabel(selected.source)}
                  </p>
                  <p className="mt-2 text-sm font-medium text-gold-800">
                    {refundStatusUiLabel(selected.status, selected.viaMidtrans)}
                    {flagLabel ? ` · ${flagLabel}` : ""}
                  </p>
                  <div className="mt-4">
                    <RefundTimeline steps={refundTimeline(selected)} />
                  </div>
                  <p className="mt-2 text-sm text-ink/70">{selected.reason}</p>
                  {selected.bankName ? (
                    <p className="mt-3 rounded-2xl bg-[#f7f5fc] px-4 py-3 font-mono text-sm text-ink">
                      {selected.bankName} · {selected.accountName} · {selected.accountNumber}
                    </p>
                  ) : null}
                  <p className="mt-3 flex flex-wrap gap-3 text-sm">
                    {selected.organizerProfileId ? (
                      <Link className="text-gold-700 underline-offset-2 hover:underline" href={`/admin/organizers/${selected.organizerProfileId}`}>
                        Profil penyelenggara
                      </Link>
                    ) : null}
                    {selected.eventId ? (
                      <Link className="text-gold-700 underline-offset-2 hover:underline" href={`/admin/events/${selected.eventId}`}>
                        Event
                      </Link>
                    ) : null}
                    <Link className="text-gold-700 underline-offset-2 hover:underline" href="/admin/audit">
                      Jejak audit
                    </Link>
                  </p>
                  <label className="mt-4 block text-sm">
                    Alasan eskalasi (minimal 10 karakter)
                    <textarea
                      className="mt-1 w-full rounded-xl border border-stone-200 bg-white p-2"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      minLength={10}
                    />
                  </label>
                  {selected.status === "REQUESTED" ? (
                    <p className="mt-4 rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-4 text-sm">
                      Eskalasi hanya jika penyelenggara tidak merespons.
                      <span className="mt-3 flex flex-wrap gap-3">
                        <Button type="button" loading={busyId === selected.id} onClick={() => void escalate(selected.id, "APPROVE")}>
                          Eskalasi: setujui
                        </Button>
                        <Button type="button" variant="secondary" loading={busyId === selected.id} onClick={() => void escalate(selected.id, "REJECT")}>
                          Eskalasi: tolak
                        </Button>
                      </span>
                    </p>
                  ) : null}
                  {selected.viaMidtrans && (selected.status === "APPROVED" || selected.status === "PROCESSING" || selected.status === "FAILED") ? (
                    <div className="mt-4 space-y-3 rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-4">
                      <p className="text-sm">Refund Midtrans ke sumber pembayaran pembeli. Bukan transfer manual.</p>
                      {selected.status === "FAILED" ? (
                        <Button type="button" loading={busyId === selected.id} onClick={() => void retryMidtrans(selected.id)}>
                          Kirim ulang ke Midtrans
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  {!selected.viaMidtrans && (selected.status === "APPROVED" || selected.status === "PROCESSING" || selected.status === "FAILED") ? (
                    <div className="mt-4 space-y-3 rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-4">
                      <p className="text-sm">Ambil alih transfer jika hold 24 jam terlewati.</p>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => setProof(e.target.files?.[0] || null)}
                      />
                      <Button type="button" loading={busyId === selected.id} onClick={() => void takeoverTransfer(selected.id)}>
                        Selesaikan atas nama platform
                      </Button>
                    </div>
                  ) : null}
                  {selected.hasTransferProof ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/admin/refunds/${selected.id}/proof`}
                      alt={`Bukti ${selected.refundNumber}`}
                      className="mt-4 max-h-48 rounded-2xl border border-stone-200 object-contain"
                    />
                  ) : null}
                  {selected.requestedAt ? (
                    <p className="mt-3 text-xs text-ink/45">Diajukan {formatDateTime(selected.requestedAt)}</p>
                  ) : null}
                </div>
              ) : null
            }
          />
        </div>

        <div className="mt-10 border-t border-stone-100 pt-6">
          <button type="button" className="text-sm font-medium text-gold-700 underline-offset-2 hover:underline" onClick={() => setShowNote((v) => !v)}>
            {showNote ? "Sembunyikan" : "Catatan admin (bukan pengajuan pembeli)"}
          </button>
          {showNote ? (
            <form
              className="mt-4 max-w-xl space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void createNote();
              }}
            >
              <p className="text-sm text-ink/60">Untuk koreksi uji. Pengajuan 75% + rekening tetap dari pembeli.</p>
              <label className="block text-sm">
                ID order
                <input className="mt-1 w-full rounded-xl border border-stone-200 p-2" value={orderId} onChange={(e) => setOrderId(e.target.value)} required />
              </label>
              <label className="block text-sm">
                Nominal Rupiah
                <input className="mt-1 w-full rounded-xl border border-stone-200 p-2" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </label>
              <label className="block text-sm">
                Alasan
                <textarea className="mt-1 w-full rounded-xl border border-stone-200 p-2" value={note} onChange={(e) => setNote(e.target.value)} required minLength={10} />
              </label>
              <Button type="submit">Simpan catatan</Button>
            </form>
          ) : null}
        </div>
      </Container>
    </div>
  );
}
