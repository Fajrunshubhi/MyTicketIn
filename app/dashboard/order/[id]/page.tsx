"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { formatRupiah } from "@/lib/format";
import { apiFetch, readApiError } from "@/lib/api";
import { downloadOrderReceiptPdf } from "@/lib/order-receipt-pdf";
import { pingNotificationsLive } from "@/lib/notifications-live";
import { PaymentInstructionCard } from "@/components/checkout/PaymentInstructionCard";
import { VA_BANKS, sanitizePaymentInstructions, type VaBank } from "@/lib/payment-methods";
import {
  completedRefundTotal,
  hasOpenRefundRequest,
  orderDocumentKind,
  orderStatusUiLabel,
  refundSourceUiLabel,
  refundStatusUiLabel,
  ticketsCancelledByRefund,
} from "@/lib/order-refund-display";

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt?: string | null;
  paidAt?: string | null;
  organizerName?: string;
  buyer?: { name?: string; email?: string; phone?: string };
  payment?: { method?: string; provider?: string; externalReference?: string };
  items: {
    name: string;
    quantity: number;
    unitPriceRupiah?: number;
    lineTotalRupiah: number;
    seatLabel?: string;
    attendees?: { fullName: string; email?: string; identityNumber?: string }[];
  }[];
  subtotalRupiah: number;
  redeemedPoints: number;
  loyaltyDiscountRupiah: number;
  promoDiscountRupiah?: number;
  promoCode?: string | null;
  totalPayableRupiah: number;
  expiresAt: string;
  serverTime: string;
  event?: {
    title?: string;
    slug?: string;
    startsAt?: string | null;
    timezone?: string;
    venueName?: string;
    city?: string;
    province?: string;
  };
  refunds?: {
    id: string;
    refundNumber: string;
    amountRupiah: number;
    status: string;
    reason: string;
    source?: string;
    viaMidtrans?: boolean;
  }[];
  ticketsCancelled?: boolean;
};

type Payment = {
  id: string;
  status: string;
  method: string;
  provider?: string;
  externalReference?: string;
  amountRupiah: number;
  instructions?: ReturnType<typeof sanitizePaymentInstructions>;
  expiresAt?: string;
  providerExpiresAt?: string;
  sandbox?: boolean;
  provider?: string;
  redirectUrl?: string | null;
  orderStatus?: string;
  loyalty?: { redeemedPoints?: number; earnOnPaidPoints?: number; cashValue?: boolean };
};

function remainingMs(expiresAt: string, serverTime: string) {
  const skew = Date.now() - new Date(serverTime).getTime();
  return new Date(expiresAt).getTime() - (Date.now() - skew);
}

function formatMmSs(ms: number) {
  if (ms <= 0) return "00:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

const METHODS = [
  { id: "QRIS", title: "QRIS", hint: "Pindai kode QR dari aplikasi bank atau e-wallet." },
  { id: "VIRTUAL_ACCOUNT", title: "Virtual Account", hint: "Transfer dari ATM, m-banking, atau internet banking." },
  { id: "EWALLET", title: "E-wallet", hint: "ShopeePay lewat halaman pembayaran Midtrans." },
] as const;

const VA_BANK_LABEL: Record<VaBank, string> = {
  BCA: "BCA",
  BNI: "BNI",
  BRI: "BRI",
  MANDIRI: "Mandiri",
  PERMATA: "Permata",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu pembayaran",
  PAID: "Lunas",
  EXPIRED: "Kedaluwarsa",
  CANCELLED: "Dibatalkan",
  FAILED: "Gagal",
  REFUNDED: "Direfund",
};

function methodLabel(id: string) {
  return METHODS.find((m) => m.id === id)?.title || id.replace("_", " ");
}

function instructionText(p: Payment) {
  const text = p.instructions?.copyText;
  return typeof text === "string" ? text : "";
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [left, setLeft] = useState("15:00");
  const [method, setMethod] = useState("QRIS");
  const [vaBank, setVaBank] = useState<VaBank>("BCA");
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(3000);
  const expiredReloaded = useRef(false);

  async function loadOrder() {
    const res = await fetch(`/api/orders/${params.id}`, {
      credentials: "include",
      cache: "no-store",
      headers: { "X-Silent-Loading": "1" },
    });
    const body = await res.json();
    if (!res.ok) {
      setError("Order tidak ditemukan.");
      setOrder(null);
      return;
    }
    setError("");
    setOrder((body.data as { order: Order }).order);
  }

  async function downloadReceipt() {
    if (!order) return;
    setPdfBusy(true);
    setError("");
    try {
      await downloadOrderReceiptPdf(
        {
          ...order,
          payment: order.payment || (payment
            ? { method: payment.method, provider: payment.provider, externalReference: payment.externalReference }
            : undefined),
        },
        payment ? methodLabel(payment.method) : undefined,
      );
    } catch {
      setError("Kuitansi PDF gagal diunduh. Coba lagi.");
    } finally {
      setPdfBusy(false);
    }
  }

  async function loadPayment() {
    const res = await fetch(`/api/orders/${params.id}/payment`, {
      credentials: "include",
      cache: "no-store",
      headers: { "X-Silent-Loading": "1" },
    });
    if (res.status === 404) {
      setPayment(null);
      return;
    }
    const body = await res.json();
    if (!res.ok) return;
    setPayment((body.data as { payment: Payment }).payment);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/orders/${params.id}`, {
        credentials: "include",
        cache: "no-store",
        headers: { "X-Silent-Loading": "1" },
      });
      const body = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError("Order tidak ditemukan.");
        setOrder(null);
        return;
      }
      setError("");
      setOrder((body.data as { order: Order }).order);
      const payRes = await fetch(`/api/orders/${params.id}/payment`, {
        credentials: "include",
        cache: "no-store",
        headers: { "X-Silent-Loading": "1" },
      });
      if (cancelled) return;
      if (payRes.status === 404) {
        setPayment(null);
        return;
      }
      const payBody = await payRes.json();
      if (payRes.ok) setPayment((payBody.data as { payment: Payment }).payment);
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  useEffect(() => {
    expiredReloaded.current = false;
  }, [order?.id, order?.expiresAt]);

  useEffect(() => {
    if (!order) return;
    const tick = () => {
      const ms = remainingMs(order.expiresAt, order.serverTime);
      setLeft(formatMmSs(ms));
      if (ms <= 0 && order.status === "PENDING" && !expiredReloaded.current) {
        expiredReloaded.current = true;
        void loadOrder();
      }
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.expiresAt, order?.serverTime, order?.status]);

  useEffect(() => {
    const terminal = payment && ["SUCCEEDED", "FAILED", "EXPIRED", "REFUNDED"].includes(payment.status);
    if (!payment || terminal) {
      if (pollRef.current) clearTimeout(pollRef.current);
      pollRef.current = null;
      return;
    }
    let cancelled = false;
    const loop = async () => {
      if (cancelled) return;
      if (typeof document === "undefined" || document.visibilityState !== "hidden") {
        await loadPayment();
        await loadOrder();
      }
      if (!cancelled) {
        pollRef.current = setTimeout(loop, delayRef.current);
      }
    };
    pollRef.current = setTimeout(loop, delayRef.current);
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
      pollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment?.id, payment?.status, params.id]);

  async function startPay() {
    setBusy(true);
    setInfo("");
    const res = await apiFetch(`/api/orders/${params.id}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": `pay-${params.id}` },
      body: JSON.stringify({ method, bank: method === "VIRTUAL_ACCOUNT" ? vaBank : undefined }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(readApiError(body, "Tidak dapat membuat pembayaran."));
      return;
    }
    setError("");
    setPayment((body.data as { payment: Payment }).payment);
    setInfo("Instruksi pembayaran siap. Status lunas hanya dari konfirmasi pembayaran, bukan dari halaman ini.");
    pingNotificationsLive();
  }

  async function simulate() {
    setBusy(true);
    const res = await apiFetch(`/api/orders/${params.id}/payment/sandbox-settle`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(readApiError(body, "Simulasi webhook gagal."));
      return;
    }
    setInfo("Konfirmasi sedang diproses. Bukan bukti berhasil.");
    pingNotificationsLive();
    await loadPayment();
    await loadOrder();
  }

  async function refreshStatus() {
    setBusy(true);
    setInfo("");
    const res = await apiFetch(`/api/orders/${params.id}/payment/refresh`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(readApiError(body, "Status pembayaran belum dapat dicek."));
      return;
    }
    setError("");
    setPayment((body.data as { payment: Payment }).payment);
    await loadOrder();
    pingNotificationsLive();
  }

  async function copyInstr(text?: string) {
    const value = text || (payment ? instructionText(payment) : "");
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setInfo("Instruksi disalin.");
  }

  const eventHref = order?.event?.slug ? `/events/${order.event.slug}` : "/events";
  const holdLeftMs = order ? remainingMs(order.expiresAt, order.serverTime) : 0;
  const holdExpired = order?.status === "PENDING" && holdLeftMs <= 0;
  const pending = order?.status === "PENDING" && !holdExpired;
  const expired = order?.status === "EXPIRED" || holdExpired;
  const docKind = order
    ? orderDocumentKind(expired ? "EXPIRED" : order.status, order.refunds, Boolean(order.ticketsCancelled))
    : "pending";
  const ticketsGone = Boolean(order && ticketsCancelledByRefund(order.status, order.refunds));
  const refundedAmt = order ? completedRefundTotal(order.refunds) : 0;
  const leftoverAmt = order ? Math.max(0, order.totalPayableRupiah - refundedAmt) : 0;
  const awaitingRefund = Boolean(order && hasOpenRefundRequest(order.refunds));
  const livePaid = docKind === "paid";
  const displayHeading = expired ? STATUS_LABEL.EXPIRED : order ? orderStatusUiLabel(docKind) : "Memuat pembayaran";
  const urgent = Boolean(order && pending && holdLeftMs < 3 * 60 * 1000);

  return (
    <div>
        <ol className="mb-6 flex flex-wrap gap-2 text-xs font-medium sm:text-sm" aria-label="Langkah checkout">
          <li>
            <span className="rounded-full bg-white px-3 py-1.5 text-ink/45">1. Pilih tiket</span>
          </li>
          <li>
            <span className="rounded-full bg-white px-3 py-1.5 text-ink/45">2. Data pemegang</span>
          </li>
          <li>
            <span className="rounded-full bg-gold-500 px-3 py-1.5 text-white">3. Pembayaran</span>
          </li>
        </ol>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Order {order?.orderNumber}</p>
            <h1 tabIndex={-1} className="font-display mt-1 text-3xl text-ink">
              {displayHeading}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {order ? (
              <Button variant="secondary" loading={pdfBusy} disabled={pdfBusy} onClick={() => void downloadReceipt()}>
                Unduh kuitansi PDF
              </Button>
            ) : null}
            {payment && payment.sandbox === false ? (
              <p className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gold-800" role="note">
                Pembayaran Midtrans
              </p>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="mt-4">
            <Alert tone="error" title={error} />
          </div>
        ) : null}
        {info ? (
          <div className="mt-4">
            <Alert tone="info" title={info} />
          </div>
        ) : null}

        {order ? (
          <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
            <div className="space-y-5">
              {livePaid ? (
                <section className="rounded-3xl border border-stone-200 bg-white p-6">
                  <p className="flex items-center gap-2 font-semibold text-ink">
                    <Icon name="success" className="h-5 w-5 text-gold-600" />
                    Pembayaran diterima
                  </p>
                  <p className="mt-2 text-sm text-ink/70">
                    {awaitingRefund
                      ? "Pengajuan refund menunggu keputusan. Tiket masih berlaku sampai disetujui."
                      : "Tiket QR ada di wallet. Kuitansi PDF berisi rincian pembayaran untuk disimpan."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => { window.location.href = "/dashboard/ticket"; }}>Buka tiket saya</Button>
                    <Button variant="secondary" loading={pdfBusy} disabled={pdfBusy} onClick={() => void downloadReceipt()}>
                      Unduh kuitansi PDF
                    </Button>
                  </div>
                </section>
              ) : null}

              {docKind === "cancelled" || docKind === "refunded" ? (
                <section className="rounded-3xl border border-stone-200 bg-white p-6">
                  <p className="flex items-center gap-2 font-semibold text-ink">
                    <Icon name="info" className="h-5 w-5 text-gold-600" />
                    {docKind === "cancelled" ? "Pembatalan selesai" : "Refund selesai"}
                  </p>
                  <p className="mt-2 text-sm text-ink/70">
                    Tiket tidak berlaku untuk masuk. {formatRupiah(refundedAmt)} dikembalikan
                    {docKind === "cancelled" ? `; ${formatRupiah(leftoverAmt)} tidak dikembalikan (25%).` : "."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => { window.location.href = "/dashboard/ticket?status=CANCELLED"; }}>
                      Lihat tiket dibatalkan
                    </Button>
                    <Button variant="secondary" loading={pdfBusy} disabled={pdfBusy} onClick={() => void downloadReceipt()}>
                      Unduh kuitansi PDF
                    </Button>
                  </div>
                </section>
              ) : null}

              {expired ? (
                <section className="rounded-3xl border border-stone-200 bg-white p-6">
                  <p className="flex items-center gap-2 font-semibold text-ink">
                    <Icon name="clock" className="h-5 w-5 text-gold-600" />
                    Waktu reservasi habis
                  </p>
                  <p className="mt-2 text-sm text-ink/70">
                    Pembayaran terlambat tidak menerbitkan tiket. Kuota dikembalikan ke katalog.
                  </p>
                  <Link
                    href={eventHref}
                    className="mt-4 inline-flex min-h-11 items-center rounded-full bg-gold-500 px-4 text-sm font-semibold text-white"
                  >
                    Pilih tiket lagi
                  </Link>
                </section>
              ) : null}

              {pending && !payment ? (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void startPay();
                  }}
                >
                  <fieldset>
                    <legend className="text-lg font-semibold text-ink">Pilih metode pembayaran</legend>
                    <ul className="mt-3 grid gap-3">
                      {METHODS.map((m) => {
                        const on = method === m.id;
                        return (
                          <li key={m.id}>
                            <label
                              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border bg-white p-4 ${
                                on ? "border-gold-500 ring-2 ring-gold-500/20" : "border-stone-200"
                              }`}
                            >
                              <input
                                type="radio"
                                name="method"
                                value={m.id}
                                checked={on}
                                onChange={() => setMethod(m.id)}
                                className="mt-1 accent-gold-600"
                              />
                              <span>
                                <span className="block font-semibold text-ink">{m.title}</span>
                                <span className="mt-1 block text-sm text-ink/60">{m.hint}</span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </fieldset>
                  {method === "VIRTUAL_ACCOUNT" ? (
                    <fieldset>
                      <legend className="text-sm font-semibold text-ink">Bank tujuan</legend>
                      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {VA_BANKS.map((bank) => {
                          const on = vaBank === bank;
                          return (
                            <li key={bank}>
                              <label
                                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-medium ${
                                  on ? "border-gold-500 bg-gold-500/10 text-ink" : "border-stone-200 bg-white text-ink/80"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="vaBank"
                                  value={bank}
                                  checked={on}
                                  onChange={() => setVaBank(bank)}
                                  className="accent-gold-600"
                                />
                                {VA_BANK_LABEL[bank]}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </fieldset>
                  ) : null}
                  <Button className="w-full sm:w-auto" type="submit" loading={busy} disabled={busy}>
                    Bayar {formatRupiah(order.totalPayableRupiah)}
                  </Button>
                </form>
              ) : null}

              {payment && pending ? (
                <>
                  <PaymentInstructionCard
                    methodLabel={methodLabel(payment.method)}
                    amountRupiah={payment.amountRupiah}
                    status={payment.status}
                    provider={String(payment.provider || "sandbox")}
                    sandbox={payment.sandbox !== false}
                    instructions={sanitizePaymentInstructions(payment.instructions)}
                    redirectUrl={payment.redirectUrl}
                    pending={pending}
                    busy={busy}
                    onCopy={(text) => void copyInstr(text)}
                    onRefresh={() => void refreshStatus()}
                    onSimulate={String(payment.provider || "sandbox") === "sandbox" ? () => void simulate() : undefined}
                  />
                  {payment.loyalty ? (
                    <p className="text-sm text-ink/60">
                      Perkiraan earn {payment.loyalty.earnOnPaidPoints} poin setelah lunas. Bukan nilai tunai.
                    </p>
                  ) : null}
                </>
              ) : null}

              {order.status === "PAID" || order.status === "REFUNDED" ? (
                <section className="rounded-3xl border border-stone-200 bg-white p-5">
                  <h2 className="text-lg font-semibold text-ink">Refund</h2>
                  <p className="mt-1 text-sm text-ink/65">
                    Pembatalan oleh Anda: 75% nominal, 25% tidak dikembalikan. Pembayaran Midtrans dikembalikan ke sumber
                    bayar setelah disetujui. Jika event dibatalkan penyelenggara, sisa dikembalikan 100%. Tiket yang sudah
                    check-in tidak dapat direfund.
                  </p>
                  {(order.refunds || []).length > 0 ? (
                    <ul className="mt-4 space-y-2 text-sm">
                      {(order.refunds || []).map((rf) => (
                        <li key={rf.id} className="rounded-xl bg-[#f7f8fd] px-3 py-2" title={rf.reason}>
                          <span className="font-medium text-ink">{rf.refundNumber}</span>
                          <span className="text-ink/60">
                            {" "}
                            · {refundStatusUiLabel(rf.status, Boolean(rf.viaMidtrans))} · {formatRupiah(rf.amountRupiah)}
                          </span>
                          {rf.source ? (
                            <span className="mt-0.5 block text-xs text-ink/50">{refundSourceUiLabel(rf.source)}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {livePaid && !awaitingRefund && !ticketsGone ? (
                    <p className="mt-4">
                      <Link
                        href={`/dashboard/refunds?order=${order.id}`}
                        className="inline-flex min-h-11 items-center rounded-full bg-gold-500 px-4 text-sm font-semibold text-white"
                      >
                        Ajukan refund
                      </Link>
                    </p>
                  ) : (
                    <p className="mt-4">
                      <Link className="text-sm font-medium text-gold-700 underline-offset-2 hover:underline" href="/dashboard/refunds">
                        Buka riwayat refund
                      </Link>
                    </p>
                  )}
                </section>
              ) : null}
            </div>

            <aside className="rounded-3xl border border-stone-200 bg-white p-5 shadow-card lg:sticky lg:top-24">
              {pending ? (
                <p
                  role="status"
                  aria-live="polite"
                  className={`mb-4 flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold ${
                    urgent ? "bg-red-50 text-red-800" : "bg-[#eee8ff] text-gold-800"
                  }`}
                >
                  <Icon name="clock" className="h-4 w-4" />
                  Selesaikan dalam {left}
                </p>
              ) : null}
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Ringkasan pesanan</p>
              <h2 className="mt-2 font-display text-xl text-ink">{order.event?.title || "Order"}</h2>
              <ul className="mt-4 space-y-3 border-b border-stone-100 pb-4">
                {order.items.map((it, idx) => (
                  <li key={idx} className="text-sm text-ink/80">
                    <div className="flex justify-between gap-3">
                      <span>
                        {it.name} {it.seatLabel ? `· ${it.seatLabel}` : ""} × {it.quantity}
                      </span>
                      <span className="shrink-0 font-medium">{formatRupiah(it.lineTotalRupiah)}</span>
                    </div>
                    {it.attendees && it.attendees.length > 0 ? (
                      <ul className="mt-1 text-xs text-ink/55">
                        {it.attendees.map((a) => (
                          <li key={a.identityNumber || a.fullName}>{a.fullName}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex justify-between text-sm">
                <span>Subtotal</span>
                <span>{formatRupiah(order.subtotalRupiah)}</span>
              </p>
              {order.promoDiscountRupiah ? (
                <p className="mt-1 flex justify-between text-sm text-ink/70">
                  <span>Kode promo {order.promoCode}</span>
                  <span>− {formatRupiah(order.promoDiscountRupiah)}</span>
                </p>
              ) : null}
              <p className="mt-1 flex justify-between text-sm text-ink/70">
                <span>Poin {order.redeemedPoints}</span>
                <span>− {formatRupiah(order.loyaltyDiscountRupiah)}</span>
              </p>
              <p className="mt-4 flex justify-between text-lg font-semibold text-ink">
                <span>Total</span>
                <span>{formatRupiah(order.totalPayableRupiah)}</span>
              </p>
              {refundedAmt > 0 ? (
                <>
                  <p className="mt-2 flex justify-between text-sm text-ink/70">
                    <span>Refund</span>
                    <span>− {formatRupiah(refundedAmt)}</span>
                  </p>
                  <p className="mt-1 flex justify-between text-sm text-ink/70">
                    <span>{docKind === "cancelled" ? "Tidak dikembalikan" : "Sisa setelah refund"}</span>
                    <span>{formatRupiah(leftoverAmt)}</span>
                  </p>
                </>
              ) : null}
              {pending && !payment ? (
                <Button
                  className="mt-4 w-full"
                  loading={busy}
                  disabled={busy}
                  onClick={() => void startPay()}
                >
                  Bayar {formatRupiah(order.totalPayableRupiah)}
                </Button>
              ) : null}
              <Button
                className="mt-4 w-full"
                variant="secondary"
                loading={pdfBusy}
                disabled={pdfBusy}
                onClick={() => void downloadReceipt()}
              >
                Unduh kuitansi PDF
              </Button>
              <p className="mt-3 text-xs text-ink/50">Poin loyalty tidak bernilai tunai dan tidak dapat diuangkan. Hold berakhir jika waktu habis.</p>
            </aside>
          </div>
        ) : null}
    </div>
  );
}
