"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Container } from "@/components/ui/Container";
import { formatRupiah } from "@/lib/format";
import { apiFetch, readApiError } from "@/lib/api";

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  items: {
    name: string;
    quantity: number;
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
  event?: { title?: string; slug?: string };
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const delayRef = useRef(3000);

  async function loadOrder() {
    const res = await fetch(`/api/orders/${params.id}`, { credentials: "include", cache: "no-store" });
    const body = await res.json();
    if (!res.ok) {
      setError("Order tidak ditemukan.");
      setOrder(null);
      return;
    }
    setError("");
    setOrder((body.data as { order: Order }).order);
  }

  async function loadPayment() {
    const res = await fetch(`/api/orders/${params.id}/payment`, { credentials: "include", cache: "no-store" });
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
      const res = await fetch(`/api/orders/${params.id}`, { credentials: "include", cache: "no-store" });
      const body = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError("Order tidak ditemukan.");
        setOrder(null);
        return;
      }
      setError("");
      setOrder((body.data as { order: Order }).order);
      const payRes = await fetch(`/api/orders/${params.id}/payment`, { credentials: "include", cache: "no-store" });
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
    if (!order) return;
    const tick = () => {
      const ms = remainingMs(order.expiresAt, order.serverTime);
      setLeft(formatMmSs(ms));
      if (ms <= 0 && order.status === "PENDING") loadOrder();
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.expiresAt, order?.serverTime, order?.status]);

  useEffect(() => {
    const terminal = payment && ["SUCCEEDED", "FAILED", "EXPIRED", "REFUNDED"].includes(payment.status);
    if (!payment || terminal) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    const loop = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      loadPayment().then(loadOrder);
    };
    pollRef.current = setInterval(loop, delayRef.current);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
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

  return (
    <div>
      <Container>
        <p className="mb-4 rounded-lg border border-gold-400/40 bg-gold-400/10 px-3 py-2 text-sm text-gold-800" role="note">
          SANDBOX / TRANSAKSI UJI · poin loyalty tidak bernilai tunai
        </p>
        {error ? <Alert tone="error" title={error} /> : null}
        {info ? <Alert tone="info" title={info} /> : null}
        {order ? (
          <article>
            <h1 tabIndex={-1} className="font-display text-3xl text-ink">
              {order.orderNumber}
            </h1>
            <p className="mt-2 text-ink/70">{order.event?.title}</p>
            <p role="status" aria-live="polite" className="mt-4 text-xl text-gold-700">
              Status {order.status}
              {order.status === "PENDING" ? ` · sisa ${left}` : null}
            </p>
            <ul className="mt-6 space-y-2">
              {order.items.map((it, idx) => (
                <li key={idx} className="text-ink/80">
                  {it.name} {it.seatLabel ? `· ${it.seatLabel}` : ""} × {it.quantity} — {formatRupiah(it.lineTotalRupiah)}
                  {it.attendees && it.attendees.length > 0 ? (
                    <ul className="mt-1 text-sm text-ink/60">
                      {it.attendees.map((a) => (
                        <li key={a.identityNumber || a.fullName}>Pemegang: {a.fullName}{a.identityNumber ? ` · NIK ${a.identityNumber}` : ""}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="mt-4">Subtotal {formatRupiah(order.subtotalRupiah)}</p>
            <p>Poin ditukar {order.redeemedPoints} · diskon {formatRupiah(order.loyaltyDiscountRupiah)}</p>
            <p className="text-lg font-semibold">Total {formatRupiah(order.totalPayableRupiah)}</p>
            {order.status === "PAID" ? (
              <p className="mt-4">
                <Link className="text-gold-700 underline" href="/tickets">
                  Buka tiket saya
                </Link>
              </p>
            ) : null}
            {order.status === "EXPIRED" ? (
              <p className="mt-4">
                Reservasi berakhir. Pembayaran terlambat tidak menerbitkan tiket.
                {order.event?.slug ? (
                  <>
                    {" "}
                    <Link className="text-gold-700 underline" href={`/events/${order.event.slug}`}>
                      Kembali ke event
                    </Link>
                  </>
                ) : null}
              </p>
            ) : null}
            {order.status === "PENDING" && !payment ? (
              <form
                className="mt-6 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  startPay();
                }}
              >
                <fieldset>
                  <legend className="text-sm text-ink/80">Metode sandbox</legend>
                  {["QRIS", "VIRTUAL_ACCOUNT", "EWALLET"].map((m) => (
                    <label key={m} className="mr-4 inline-flex items-center gap-2 text-sm">
                      <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} />
                      {m.replace("_", " ")}
                    </label>
                  ))}
                </fieldset>
                <button className="rounded-lg bg-gold-400 px-4 py-2 text-ink disabled:opacity-50" disabled={busy} type="submit">
                  Buat pembayaran uji
                </button>
              </form>
            ) : null}
            {payment ? (
              <section className="mt-6 rounded-2xl border border-stone-200 p-4">
                <h2 className="text-lg text-ink">Instruksi {payment.method}</h2>
                <p role="status" aria-live="polite">Status pembayaran {payment.status} · SANDBOX</p>
                <p className="mt-2 font-mono text-sm break-all">{instructionText(payment) || "Instruksi tersedia setelah dibuat."}</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" className="text-sm text-gold-700 underline" onClick={copyInstr}>
                    Salin instruksi
                  </button>
                  <button type="button" className="text-sm text-gold-700 underline" onClick={() => { loadPayment(); loadOrder(); }}>
                    Muat ulang status
                  </button>
                  {payment.status === "PENDING" || payment.status === "CREATED" ? (
                    <button type="button" className="text-sm text-gold-700 underline" disabled={busy} onClick={simulate}>
                      Simulasikan webhook sukses (uji)
                    </button>
                  ) : null}
                </div>
                {payment.loyalty ? (
                  <p className="mt-3 text-sm text-ink/60">
                    Perkiraan earn {payment.loyalty.earnOnPaidPoints} poin setelah Paid. Bukan nilai tunai.
                  </p>
                ) : null}
              </section>
            ) : null}
          </article>
        ) : null}
      </Container>
    </div>
  );
}
