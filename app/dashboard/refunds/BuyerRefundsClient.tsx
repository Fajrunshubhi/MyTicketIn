"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { MidtransRefundNote, RefundInbox } from "@/components/refunds/RefundInbox";
import { RefundTimeline } from "@/components/refunds/RefundTimeline";
import { apiFetch, readApiError } from "@/lib/api";
import { formatRupiah } from "@/lib/format";
import { pingNotificationsLive } from "@/lib/notifications-live";
import { refundStatusUiLabel, refundTimeline } from "@/lib/order-refund-display";
import { REFUND_BANKS } from "@/lib/server/refund-policy";

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
  transferredAt?: string | null;
  completedAt?: string | null;
  decisionReason?: string | null;
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  hasTransferProof?: boolean;
  viaMidtrans?: boolean;
};

type Eligible = {
  id: string;
  orderNumber: string;
  eventTitle: string;
  totalPayableRupiah: number;
  estimatedRefundRupiah: number;
  viaMidtrans?: boolean;
};

function holdLabel(due?: string | null) {
  if (!due) return "";
  const ms = new Date(due).getTime() - Date.now();
  if (ms <= 0) return "Batas 24 jam terlewati — tetap menunggu bukti transfer.";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `Sisa waktu transfer penyelenggara: ${h} jam ${m} menit.`;
}

export function BuyerRefundsClient() {
  const search = useSearchParams();
  const focusId = search.get("refund") || "";
  const preOrder = search.get("order") || "";
  const [items, setItems] = useState<Refund[]>([]);
  const [eligible, setEligible] = useState<Eligible[]>([]);
  const [banks, setBanks] = useState<string[]>([...REFUND_BANKS]);
  const [orderId, setOrderId] = useState(preOrder);
  const [reason, setReason] = useState("");
  const [bankName, setBankName] = useState("BCA");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(focusId);
  const [filter, setFilter] = useState("all");

  function load() {
    fetch("/api/me/refunds", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(readApiError(body, "Gagal memuat refund."));
          setLoading(false);
          return;
        }
        setItems((body.data?.items || []) as Refund[]);
        setEligible((body.data?.eligibleOrders || []) as Eligible[]);
        if (Array.isArray(body.data?.banks) && body.data.banks.length) setBanks(body.data.banks as string[]);
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
    if (preOrder) setOrderId(preOrder);
  }, [preOrder]);

  useEffect(() => {
    if (focusId) setSelectedId(focusId);
  }, [focusId]);

  const selectedOrder = useMemo(() => eligible.find((row) => row.id === orderId), [eligible, orderId]);
  const visible = useMemo(() => {
    if (filter === "open") return items.filter((i) => i.status !== "COMPLETED" && i.status !== "REJECTED");
    if (filter === "done") return items.filter((i) => i.status === "COMPLETED" || i.status === "REJECTED");
    return items;
  }, [items, filter]);
  const selected = visible.find((i) => i.id === selectedId) || items.find((i) => i.id === selectedId);

  async function submit() {
    if (!orderId) {
      setError("Pilih order yang akan dibatalkan.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await apiFetch(`/api/orders/${orderId}/refunds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, bankName, accountName, accountNumber }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(readApiError(body, "Tidak dapat mengajukan refund."));
      return;
    }
    setMessage("Pengajuan terkirim.");
    setReason("");
    pingNotificationsLive();
    load();
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-800">Refund pembeli</p>
        <h1 className="font-display mt-2 text-3xl text-ink">Refund saya</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/65">
          Pembatalan pembeli mengembalikan 75%. QRIS dan e-wallet Midtrans dikembalikan ke sumber bayar setelah disetujui.
          Virtual account memakai transfer merchant ke rekening Anda.
        </p>
      </header>

      {error ? <Alert tone="error" title={error} /> : null}
      {message ? <Alert tone="info" title={message} /> : null}
      <MidtransRefundNote />

      <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm md:p-6">
        <h2 className="text-lg font-semibold text-ink">Ajukan refund</h2>
        {eligible.length === 0 ? (
          <p className="mt-2 text-sm text-ink/60">Tidak ada order yang dapat diajukan refund saat ini.</p>
        ) : (
          <form
            className="mt-4 grid gap-3 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="block text-sm md:col-span-2">
              Order
              <select
                className="mt-1 h-11 w-full rounded-xl border border-stone-200 bg-white px-3"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                required
              >
                <option value="">Pilih order</option>
                {eligible.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.orderNumber} · {row.eventTitle} · {formatRupiah(row.estimatedRefundRupiah)}
                  </option>
                ))}
              </select>
            </label>
            {selectedOrder ? (
              <p className="rounded-2xl bg-[#f7f5fc] px-4 py-3 text-sm text-ink/70 md:col-span-2">
                Estimasi dikembalikan {formatRupiah(selectedOrder.estimatedRefundRupiah)} dari{" "}
                {formatRupiah(selectedOrder.totalPayableRupiah)} (25% tidak dikembalikan).
              </p>
            ) : null}
            {selectedOrder?.viaMidtrans ? (
              <p className="rounded-2xl bg-[#f7f5fc] px-4 py-3 text-sm text-ink/70 md:col-span-2">
                Pengembalian lewat Midtrans ke metode bayar asli. Rekening tujuan tidak diperlukan.
              </p>
            ) : (
              <>
                <label className="block text-sm">
                  Bank / e-wallet
                  <select
                    className="mt-1 h-11 w-full rounded-xl border border-stone-200 bg-white px-3"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    required={!selectedOrder?.viaMidtrans}
                  >
                    {banks.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Nama rekening
                  <input
                    className="mt-1 h-11 w-full rounded-xl border border-stone-200 px-3"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    autoComplete="name"
                    required={!selectedOrder?.viaMidtrans}
                    minLength={3}
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  Nomor rekening
                  <input
                    className="mt-1 h-11 w-full rounded-xl border border-stone-200 px-3 font-mono"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric"
                    required={!selectedOrder?.viaMidtrans}
                    minLength={8}
                  />
                </label>
              </>
            )}
            <label className="block text-sm md:col-span-2">
              Alasan
              <textarea
                className="mt-1 w-full rounded-xl border border-stone-200 p-3"
                required
                minLength={10}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <div className="md:col-span-2">
              <Button type="submit" loading={busy} disabled={busy}>
                Kirim pengajuan
              </Button>
            </div>
          </form>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink">Riwayat</h2>
        {loading ? <p className="text-sm text-ink/55">Memuat riwayat…</p> : null}
        <RefundInbox
          items={visible}
          selectedId={selected?.id || ""}
          onSelect={setSelectedId}
          filters={[
            { id: "all", label: "Semua" },
            { id: "open", label: "Berjalan" },
            { id: "done", label: "Selesai" },
          ]}
          activeFilter={filter}
          onFilter={setFilter}
          emptyLabel="Belum ada riwayat refund."
          detail={
            selected ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-ink/45">{selected.refundNumber}</p>
                <h3 className="mt-1 text-xl font-semibold text-ink">{selected.eventTitle || "Event"}</h3>
                <p className="mt-1 text-sm text-ink/60">
                  {selected.orderNumber} · {formatRupiah(selected.amountRupiah)} ·{" "}
                  {refundStatusUiLabel(selected.status, selected.viaMidtrans)}
                </p>
                <div className="mt-4">
                  <RefundTimeline steps={refundTimeline(selected)} />
                </div>
                {selected.status === "APPROVED" && !selected.viaMidtrans ? (
                  <p className="mt-3 text-sm text-ink/70">{holdLabel(selected.transferDueAt)}</p>
                ) : null}
                <dl className="mt-4 grid gap-2 text-sm text-ink/70 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-ink/45">{selected.viaMidtrans ? "Pengembalian" : "Rekening"}</dt>
                    <dd>
                      {selected.viaMidtrans
                        ? "Sumber pembayaran Midtrans"
                        : `${selected.bankName || "—"} · ${selected.accountName || "—"}`}
                      {selected.viaMidtrans ? null : (
                        <span className="mt-0.5 block font-mono">{selected.accountNumber || "—"}</span>
                      )}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-sm text-ink/65">{selected.reason}</p>
                {selected.hasTransferProof ? (
                  <figure className="mt-4">
                    <figcaption className="text-xs font-semibold uppercase tracking-wide text-ink/45">Bukti transfer</figcaption>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/me/refunds/${selected.id}/proof`}
                      alt={`Bukti transfer ${selected.refundNumber}`}
                      className="mt-2 max-h-64 rounded-2xl border border-stone-200 object-contain"
                    />
                  </figure>
                ) : null}
                <p className="mt-4 flex flex-wrap gap-3 text-sm">
                  <Link className="text-gold-700 underline-offset-2 hover:underline" href={`/dashboard/order/${selected.orderId}`}>
                    Lihat order
                  </Link>
                  {selected.status === "REJECTED" ? (
                    <Link className="text-gold-700 underline-offset-2 hover:underline" href={`/dashboard/refunds?order=${selected.orderId}`}>
                      Ajukan ulang
                    </Link>
                  ) : null}
                </p>
              </div>
            ) : null
          }
        />
      </section>
    </div>
  );
}
