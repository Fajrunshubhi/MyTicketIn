"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { Container } from "@/components/ui/Container";
import { apiFetch, readApiError } from "@/lib/api";

export default function AdminRefundsPage() {
  const [orderId, setOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [refundId, setRefundId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function createRefund() {
    setError("");
    const res = await apiFetch("/api/admin/refunds", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": `refund-${orderId}-${amount}` },
      body: JSON.stringify({ orderId, amountRupiah: Number(amount), reason }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(readApiError(body, "Gagal membuat refund."));
      return;
    }
    const id = body.data?.refund?.id as string;
    setRefundId(id);
    setMessage(`Refund ${body.data?.refund?.refundNumber} berstatus ${body.data?.refund?.status}. SANDBOX, tanpa uang nyata.`);
  }

  async function decide(decision: string) {
    const res = await apiFetch(`/api/admin/refunds/${refundId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason: reason || "Keputusan admin refund sandbox uji." }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(readApiError(body, "Gagal memutus refund."));
      return;
    }
    setMessage(`Status refund ${body.data?.refund?.status}. Selesaikan via webhook provider sandbox.`);
  }

  return (
    <div>
      <Container>
        <p className="mb-4 text-sm text-gold-800">SANDBOX / TRANSAKSI UJI · bukan pencairan uang</p>
        <h1 className="font-display text-3xl text-ink">Refund sandbox</h1>
        {error ? <Alert tone="error" title={error} /> : null}
        {message ? <Alert tone="info" title={message} /> : null}
        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            createRefund();
          }}
        >
          <label className="block text-sm">
            ID order
            <input className="mt-1 w-full rounded bg-white p-2" value={orderId} onChange={(e) => setOrderId(e.target.value)} required />
          </label>
          <label className="block text-sm">
            Nominal Rupiah
            <input className="mt-1 w-full rounded bg-white p-2" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label className="block text-sm">
            Alasan (minimal 10 karakter)
            <textarea className="mt-1 w-full rounded bg-white p-2" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={10} />
          </label>
          <button className="rounded-lg bg-gold-400 px-4 py-2 text-ink" type="submit">Ajukan refund</button>
        </form>
        {refundId ? (
          <div className="mt-4 flex gap-3">
            <button type="button" className="text-gold-700 underline" onClick={() => decide("APPROVE")}>Setujui</button>
            <button type="button" className="text-gold-700 underline" onClick={() => decide("REJECT")}>Tolak</button>
          </div>
        ) : null}
      </Container>
    </div>
  );
}
