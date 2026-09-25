"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import BrandMark from "@/components/BrandMark";
import LogoutButton from "@/components/LogoutButton";
import { Icon } from "@/components/ui/Icon";
import { formatRupiah } from "@/lib/format";
import { apiFetch, readApiError } from "@/lib/api";
import { downloadOrderReceiptPdf } from "@/lib/order-receipt-pdf";

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt?: string | null;
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
};

type Payment = {
  id: string;
  status: string;
  method: string;
  amountRupiah: number;
  instructions?: Record<string, unknown>;
  expiresAt?: string;
  providerExpiresAt?: string;
  sandbox?: boolean;
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
  { id: "EWALLET", title: "E-wallet", hint: "GoPay, OVO, DANA, dan sejenisnya (sandbox)." },
] as const;

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu pembayaran",
  PAID: "Lunas",
  EXPIRED: "Kedaluwarsa",
  CANCELLED: "Dibatalkan",
  FAILED: "Gagal",
};

function methodLabel(id: string) {
  return METHODS.find((m) => m.id === id)?.title || id.replace("_", " ");
}

function instructionText(p: Payment) {
  const ins = p.instructions || {};
  const copy = ins.copyText ?? ins.virtualAccount ?? ins.qrisPayload;
  return typeof copy === "string" ? copy : "";
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [left, setLeft] = useState("15:00");
  const [method, setMethod] = useState("QRIS");
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
      await downloadOrderReceiptPdf(order, payment ? methodLabel(payment.method) : undefined);
    } catch {
      setError("Receipt PDF gagal diunduh. Coba lagi.");
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
      body: JSON.stringify({ method }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(readApiError(body, "Tidak dapat membuat pembayaran sandbox."));
      return;
    }
    setError("");
    setPayment((body.data as { payment: Payment }).payment);
    setInfo("Instruksi SANDBOX tampil. Status tepercaya hanya dari konfirmasi webhook, bukan dari halaman ini.");
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
    await loadPayment();
    await loadOrder();
  }

  async function copyInstr() {
    if (!payment) return;
    const text = instructionText(payment);
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setInfo("Instruksi disalin.");
  }

  const eventHref = order?.event?.slug ? `/events/${order.event.slug}` : "/events";
  const pending = order?.status === "PENDING";
  const urgent =
    Boolean(order && pending && remainingMs(order.expiresAt, order.serverTime) < 3 * 60 * 1000);

  return (
    <div className="min-h-screen bg-[#f7f5fc]">
      <header className="fixed inset-x-0 top-0 z-50 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <BrandMark compact href="/" />
          <p className="hidden min-w-0 truncate text-sm font-medium text-ink/70 sm:block">
            {order?.event?.title || "Pembayaran"}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={eventHref}
              className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-gold-800 hover:underline"
            >
              Kembali ke event
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="h-[4.25rem]" aria-hidden="true" />

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
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
              {order ? STATUS_LABEL[order.status] || order.status : "Memuat pembayaran"}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {order ? (
              <Button variant="secondary" loading={pdfBusy} disabled={pdfBusy} onClick={() => void downloadReceipt()}>
                Unduh receipt PDF
              </Button>
            ) : null}
            <p className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gold-800" role="note">
              Sandbox · transaksi uji
            </p>
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
              {order.status === "PAID" ? (
                <section className="rounded-3xl border border-stone-200 bg-white p-6">
                  <p className="flex items-center gap-2 font-semibold text-ink">
                    <Icon name="success" className="h-5 w-5 text-gold-600" />
                    Pembayaran diterima
                  </p>
                  <p className="mt-2 text-sm text-ink/70">
                    Tiket QR ada di wallet. Receipt PDF berisi rincian pembayaran untuk disimpan.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => { window.location.href = "/tickets"; }}>Buka tiket saya</Button>
                    <Button variant="secondary" loading={pdfBusy} disabled={pdfBusy} onClick={() => void downloadReceipt()}>
                      Unduh receipt PDF
                    </Button>
                  </div>
                </section>
              ) : null}

              {order.status === "EXPIRED" ? (
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
                  <Button className="w-full sm:w-auto" type="submit" loading={busy} disabled={busy}>
                    Bayar {formatRupiah(order.totalPayableRupiah)}
                  </Button>
                </form>
              ) : null}

              {payment ? (
                <section className="rounded-3xl border border-stone-200 bg-white p-5">
                  <h2 className="text-lg font-semibold text-ink">Instruksi {methodLabel(payment.method)}</h2>
                  <p role="status" aria-live="polite" className="mt-1 text-sm text-ink/65">
                    Status {payment.status === "SUCCEEDED" ? "berhasil" : payment.status.toLowerCase()} · sandbox
                  </p>
                  <p className="mt-4 break-all rounded-xl bg-[#f7f8fd] p-4 font-mono text-sm text-ink">
                    {instructionText(payment) || "Instruksi tersedia setelah pembayaran dibuat."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secondary" type="button" onClick={() => void copyInstr()}>
                      Salin
                    </Button>
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => {
                        void loadPayment();
                        void loadOrder();
                      }}
                    >
                      Cek status
                    </Button>
                    {payment.status === "PENDING" || payment.status === "CREATED" ? (
                      <Button variant="secondary" type="button" loading={busy} disabled={busy} onClick={() => void simulate()}>
                        Simulasikan lunas
                      </Button>
                    ) : null}
                  </div>
                  {payment.loyalty ? (
                    <p className="mt-3 text-sm text-ink/60">
                      Perkiraan earn {payment.loyalty.earnOnPaidPoints} poin setelah lunas. Bukan nilai tunai.
                    </p>
                  ) : null}
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
              <p className="mt-1 flex justify-between text-sm text-ink/70">
                <span>Poin {order.redeemedPoints}</span>
                <span>− {formatRupiah(order.loyaltyDiscountRupiah)}</span>
              </p>
              <p className="mt-4 flex justify-between text-lg font-semibold text-ink">
                <span>Total</span>
                <span>{formatRupiah(order.totalPayableRupiah)}</span>
              </p>
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
                Unduh receipt PDF
              </Button>
              <p className="mt-3 text-xs text-ink/50">Poin loyalty sandbox tidak bernilai tunai. Hold berakhir jika waktu habis.</p>
            </aside>
          </div>
        ) : null}
      </main>
    </div>
  );
}
