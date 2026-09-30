"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { apiFetch, readApiError } from "@/lib/api";
import { formatDateTime, formatRupiah } from "@/lib/format";
import { pingNotificationsLive } from "@/lib/notifications-live";
import { RefundTimeline } from "@/components/refunds/RefundTimeline";
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
};

type Eligible = {
  id: string;
  orderNumber: string;
  eventTitle: string;
  totalPayableRupiah: number;
  estimatedRefundRupiah: number;
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
  const [openId, setOpenId] = useState(focusId);

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
    if (focusId) setOpenId(focusId);
  }, [focusId]);

  const selected = useMemo(() => eligible.find((row) => row.id === orderId), [eligible, orderId]);

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
    setMessage("Pengajuan terkirim. Penyelenggara akan memeriksa rekening Anda.");
    setReason("");
    pingNotificationsLive();
    load();
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-800">SANDBOX · bukan transfer uang nyata</p>
        <h1 className="font-display mt-2 text-3xl text-ink">Refund saya</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/65">
          Ajukan pembatalan 75% ke rekening Anda. Penyelenggara memeriksa, lalu menahan transfer paling lama 1×24 jam
          sebelum mengunggah bukti. Jika ditolak, Anda bisa mengajukan ulang.
        </p>
      </header>

      {error ? <Alert tone="error" title={error} /> : null}
      {message ? <Alert tone="info" title={message} /> : null}

      <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm md:p-6">
        <h2 className="text-lg font-semibold text-ink">Ajukan refund</h2>
        <p className="mt-1 text-sm text-ink/60">Isi rekening tujuan. Estimasi 75% dihitung otomatis dari sisa pembayaran.</p>
        {eligible.length === 0 ? (
          <p className="mt-4 text-sm text-ink/55">Tidak ada order yang bisa diajukan saat ini. Order lunas dengan tiket yang belum check-in akan muncul di sini.</p>
        ) : (
          <form
            className="mt-4 grid gap-4 md:grid-cols-2"
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
            {selected ? (
              <p className="rounded-2xl bg-[#f7f5fc] px-4 py-3 text-sm text-ink/70 md:col-span-2">
                Estimasi dikembalikan {formatRupiah(selected.estimatedRefundRupiah)} dari {formatRupiah(selected.totalPayableRupiah)}{" "}
                (25% tidak dikembalikan).
              </p>
            ) : null}
            <label className="block text-sm">
              Bank / e-wallet
              <select
                className="mt-1 h-11 w-full rounded-xl border border-stone-200 bg-white px-3"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                required
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
                required
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
                required
                minLength={8}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              Alasan (minimal 10 karakter)
              <textarea
                className="mt-1 w-full rounded-xl border border-stone-200 p-3"
                rows={3}
                minLength={10}
                required
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
        <h2 className="text-lg font-semibold text-ink">Riwayat</h2>
        {loading ? <p className="mt-4 text-sm text-ink/55">Memuat riwayat…</p> : null}
        <ul className="mt-4 grid gap-4">
          {items.map((item) => {
            const open = openId === item.id;
            const steps = refundTimeline(item);
            return (
              <li key={item.id} id={`refund-${item.id}`} className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-start justify-between gap-3 px-5 py-4 text-left"
                  onClick={() => setOpenId(open ? "" : item.id)}
                  aria-expanded={open}
                >
                  <span>
                    <span className="block text-xs font-medium uppercase tracking-wide text-ink/45">{item.refundNumber}</span>
                    <span className="mt-1 block font-semibold text-ink">{item.eventTitle || "Event"}</span>
                    <span className="mt-1 block text-sm text-ink/60">
                      {item.orderNumber} · {formatRupiah(item.amountRupiah)}
                    </span>
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      item.status === "COMPLETED"
                        ? "bg-emerald-50 text-emerald-800"
                        : item.status === "REJECTED"
                          ? "bg-red-50 text-red-800"
                          : "bg-[#eee8ff] text-gold-800"
                    }`}
                  >
                    {refundStatusUiLabel(item.status)}
                  </span>
                </button>
                {open ? (
                  <div className="border-t border-stone-100 px-5 py-5">
                    <RefundTimeline steps={steps} />
                    {item.status === "APPROVED" ? (
                      <p className="mt-2 rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-950">{holdLabel(item.transferDueAt)}</p>
                    ) : null}
                    {item.status === "REJECTED" && item.decisionReason ? (
                      <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-900">
                        Alasan ditolak: {item.decisionReason}
                      </p>
                    ) : null}
                    <dl className="mt-4 grid gap-2 text-sm text-ink/70 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-ink/45">Rekening</dt>
                        <dd>
                          {item.bankName || "—"} · {item.accountName || "—"}
                          <span className="mt-0.5 block font-mono">{item.accountNumber || "—"}</span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-ink/45">Diajukan</dt>
                        <dd>{item.requestedAt ? formatDateTime(item.requestedAt) : "—"}</dd>
                      </div>
                    </dl>
                    <p className="mt-3 text-sm text-ink/65">{item.reason}</p>
                    {item.hasTransferProof ? (
                      <figure className="mt-4">
                        <figcaption className="text-xs font-semibold uppercase tracking-wide text-ink/45">Bukti transfer</figcaption>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/me/refunds/${item.id}/proof`}
                          alt={`Bukti transfer ${item.refundNumber}`}
                          className="mt-2 max-h-64 rounded-2xl border border-stone-200 object-contain"
                        />
                      </figure>
                    ) : null}
                    <p className="mt-4 flex flex-wrap gap-3 text-sm">
                      <Link className="text-gold-700 underline-offset-2 hover:underline" href={`/dashboard/order/${item.orderId}`}>
                        Lihat order
                      </Link>
                      {item.status === "REJECTED" ? (
                        <Link className="text-gold-700 underline-offset-2 hover:underline" href={`/dashboard/refunds?order=${item.orderId}`}>
                          Ajukan ulang
                        </Link>
                      ) : null}
                    </p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {!loading && items.length === 0 ? <p className="mt-4 text-sm text-ink/55">Belum ada riwayat refund.</p> : null}
      </section>
    </div>
  );
}
