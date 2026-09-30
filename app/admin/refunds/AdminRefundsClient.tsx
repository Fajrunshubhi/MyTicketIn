"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { apiFetch, readApiError } from "@/lib/api";
import { formatDateTime, formatRupiah } from "@/lib/format";
import { RefundTimeline } from "@/components/refunds/RefundTimeline";
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
  const [openId, setOpenId] = useState(focusId);

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
      setOpenId(focusId);
      setFilter("all");
    }
  }, [focusId]);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`refund-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, items]);

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
    setMessage(`Platform menyelesaikan ${body.data?.refund?.refundNumber}. Pembeli melihat status Selesai.`);
    setProof(null);
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
    setMessage(`Catatan admin ${body.data?.refund?.refundNumber} tersimpan (bukan pengajuan pembeli).`);
    load();
  }

  return (
    <div>
      <Container>
        <p className="mb-2 text-sm text-gold-800">SANDBOX · pengawasan platform · bukan pencairan uang</p>
        <h1 className="font-display text-3xl text-ink">Pengawasan refund</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink/65">
          Keputusan rutin milik penyelenggara (rekening, setuju/tolak, hold 24 jam, bukti transfer). Admin hanya
          mengawasi SLA, audit, dan eskalasi jika tinjauan &gt; 48 jam atau transfer lewat 24 jam — seperti moderator
          marketplace, bukan antrean keputusan harian.
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

        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Filter pengawasan">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                filter === f.id ? "bg-gold-500 text-white" : "border border-stone-200 bg-white text-ink/70"
              }`}
              aria-current={filter === f.id ? "page" : undefined}
            >
              {f.label}
            </button>
          ))}
        </nav>

        <label className="mt-6 block max-w-xl text-sm">
          Alasan eskalasi (minimal 10 karakter, tercatat di audit)
          <textarea
            className="mt-1 w-full rounded-xl border border-stone-200 bg-white p-2"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={10}
          />
        </label>

        <ul className="mt-6 space-y-4">
          {visible.map((item) => {
            const open = openId === item.id;
            const flagLabel = refundOversightLabel(item.oversightFlag || null);
            return (
              <li
                id={`refund-${item.id}`}
                key={item.id}
                className={`rounded-3xl border bg-white p-5 ${
                  item.id === focusId || item.oversightFlag ? "border-amber-300" : "border-stone-200"
                }`}
              >
                <button type="button" className="flex w-full flex-wrap items-start justify-between gap-3 text-left" onClick={() => setOpenId(open ? "" : item.id)}>
                  <span>
                    <span className="block text-xs font-medium uppercase tracking-wide text-ink/45">{item.refundNumber}</span>
                    <span className="mt-1 block font-semibold text-ink">{item.eventTitle || "Event"}</span>
                    <span className="mt-1 block text-sm text-ink/60">
                      {item.organizerName} · {item.orderNumber} · {formatRupiah(item.amountRupiah)} · {refundSourceUiLabel(item.source)}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="rounded-full bg-[#eee8ff] px-3 py-1 text-xs font-semibold text-gold-800">
                      {refundStatusUiLabel(item.status)}
                    </span>
                    {flagLabel ? <span className="text-xs font-medium text-amber-800">{flagLabel}</span> : null}
                  </span>
                </button>
                {open ? (
                  <div className="mt-4 border-t border-stone-100 pt-4">
                    <RefundTimeline steps={refundTimeline(item)} />
                    <p className="mt-2 text-sm text-ink/70">{item.reason}</p>
                    {item.bankName ? (
                      <p className="mt-3 rounded-2xl bg-[#f7f5fc] px-4 py-3 font-mono text-sm text-ink">
                        {item.bankName} · {item.accountName} · {item.accountNumber}
                      </p>
                    ) : null}
                    <p className="mt-3 flex flex-wrap gap-3 text-sm">
                      {item.organizerProfileId ? (
                        <Link className="text-gold-700 underline-offset-2 hover:underline" href={`/admin/organizers/${item.organizerProfileId}`}>
                          Profil penyelenggara
                        </Link>
                      ) : null}
                      {item.eventId ? (
                        <Link className="text-gold-700 underline-offset-2 hover:underline" href={`/admin/events/${item.eventId}`}>
                          Event
                        </Link>
                      ) : null}
                      <Link className="text-gold-700 underline-offset-2 hover:underline" href="/admin/audit">
                        Jejak audit
                      </Link>
                    </p>
                    {item.status === "REQUESTED" ? (
                      <p className="mt-4 rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-4 text-sm">
                        Eskalasi hanya jika penyelenggara tidak merespons. Ini menggantikan keputusan mereka.
                        <span className="mt-3 flex flex-wrap gap-3">
                          <button
                            type="button"
                            className="font-medium text-gold-700 underline-offset-2 hover:underline"
                            disabled={busyId === item.id}
                            onClick={() => void escalate(item.id, "APPROVE")}
                          >
                            Eskalasi: setujui
                          </button>
                          <button
                            type="button"
                            className="font-medium text-ink/70 underline-offset-2 hover:underline"
                            disabled={busyId === item.id}
                            onClick={() => void escalate(item.id, "REJECT")}
                          >
                            Eskalasi: tolak
                          </button>
                        </span>
                      </p>
                    ) : null}
                    {item.status === "APPROVED" || item.status === "PROCESSING" ? (
                      <div className="mt-4 space-y-3 rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-4">
                        <p className="text-sm">
                          Ambil alih transfer sandbox jika hold 24 jam terlewati. Unggah bukti agar status pembeli selesai.
                        </p>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => setProof(e.target.files?.[0] || null)}
                        />
                        <Button type="button" loading={busyId === item.id} disabled={busyId === item.id} onClick={() => void takeoverTransfer(item.id)}>
                          Selesaikan atas nama platform
                        </Button>
                      </div>
                    ) : null}
                    {item.hasTransferProof ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/admin/refunds/${item.id}/proof`}
                        alt={`Bukti ${item.refundNumber}`}
                        className="mt-4 max-h-48 rounded-2xl border border-stone-200 object-contain"
                      />
                    ) : null}
                    {item.requestedAt ? (
                      <p className="mt-3 text-xs text-ink/45">Diajukan {formatDateTime(item.requestedAt)}</p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {visible.length === 0 ? (
          <p className="mt-6 text-sm text-ink/55">
            {filter === "attention" ? "Tidak ada kasus di luar SLA. Keputusan rutin tetap di penyelenggara." : "Tidak ada item pada filter ini."}
          </p>
        ) : null}

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
