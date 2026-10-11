"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { apiFetch, readApiError } from "@/lib/api";
import { formatDateTime, formatRupiah } from "@/lib/format";

type EventRow = {
  eventId: string;
  title: string;
  endsAt: string;
  grossRupiah: number;
  refundedRupiah: number;
  netRupiah: number;
  openRefunds: number;
  payout: { id: string; payoutNumber: string; status: string; amountRupiah: number } | null;
  blockedBy: string | null;
};

type PayoutItem = {
  id: string;
  payoutNumber: string;
  eventTitle?: string;
  amountRupiah: number;
  status: string;
  bankName: string;
  accountNumber: string;
  requestedAt: string | null;
  paidAt: string | null;
  decisionReason: string | null;
  hasTransferProof: boolean;
};

type Overview = {
  events: EventRow[];
  items: PayoutItem[];
  totals: { available: number; requested: number; paid: number; pending: number };
  holdHours: number;
  hasBank: boolean;
};

const BLOCK_TEXT: Record<string, string> = {
  NOT_ENDED: "Event belum selesai.",
  HOLD: "Dana masih ditahan untuk masa refund.",
  OPEN_REFUND: "Ada refund yang belum selesai.",
  NO_BANK: "Rekening belum dilengkapi.",
  NOT_PUBLISHED: "Event tidak dapat dicairkan.",
  ALREADY_REQUESTED: "Menunggu transfer admin.",
  ALREADY_PAID: "Sudah dicairkan.",
  NOTHING_TO_PAY: "Tidak ada dana.",
};

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Menunggu transfer",
  PAID: "Sudah dicairkan",
  REJECTED: "Ditolak",
};

export function PayoutsClient() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load() {
    const res = await fetch("/api/organizer/payouts", { credentials: "include", cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(readApiError(body, "Gagal memuat pencairan."));
      return;
    }
    setError("");
    setData(body.data as Overview);
  }

  useEffect(() => {
    void load();
  }, []);

  async function request(eventId: string) {
    setBusyId(eventId);
    setError("");
    setMessage("");
    const res = await apiFetch(`/api/organizer/events/${eventId}/payout`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID().replace(/-/g, "") },
    });
    const body = await res.json().catch(() => ({}));
    setBusyId("");
    if (!res.ok) {
      setError(readApiError(body, "Pencairan gagal diajukan."));
      return;
    }
    setMessage("Pencairan diajukan. Admin akan mentransfer ke rekening terdaftar (sandbox).");
    await load();
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink/70">
        Pembayaran pembeli diterima akun platform. Setelah event selesai dan masa tahan {data?.holdHours ?? 24} jam lewat,
        Anda dapat mengajukan pencairan hasil penjualan bersih (setelah refund) ke rekening terdaftar. Sandbox, bukan uang
        nyata.
      </p>
      {error ? <Alert tone="error" title={error} /> : null}
      {message ? <Alert tone="success" title={message} /> : null}
      {data && !data.hasBank ? (
        <Alert tone="warning" title="Rekening penyelenggara belum diisi">
          Lengkapi nomor rekening di <Link className="underline" href="/dashboard/profile">profil</Link> agar dana dapat dicairkan.
        </Alert>
      ) : null}

      {data ? (
        <dl className="grid gap-3 sm:grid-cols-4" aria-label="Ringkasan dana">
          {[
            ["Siap dicairkan", data.totals.available],
            ["Menunggu transfer", data.totals.requested],
            ["Sudah dicairkan", data.totals.paid],
            ["Belum bisa dicairkan", data.totals.pending],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-stone-200 bg-white p-4">
              <dt className="text-xs text-ink/55">{label}</dt>
              <dd className="mt-1 text-lg font-semibold text-ink">{formatRupiah(Number(value))}</dd>
            </div>
          ))}
        </dl>
      ) : (
        !error && <p className="text-sm text-ink/60">Memuat…</p>
      )}

      {data && data.events.length === 0 ? (
        <p className="text-sm text-ink/60">Belum ada penjualan lunas pada event Anda.</p>
      ) : null}

      {data && data.events.length > 0 ? (
        <section aria-labelledby="payout-events">
          <h2 id="payout-events" className="mb-2 text-base font-semibold text-ink">
            Dana per event
          </h2>
          <ul className="space-y-3">
            {data.events.map((e) => (
              <li key={e.eventId} className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink">{e.title}</p>
                    <p className="text-xs text-ink/55">Selesai {formatDateTime(e.endsAt)}</p>
                  </div>
                  <p className="text-lg font-semibold text-ink">{formatRupiah(e.netRupiah)}</p>
                </div>
                <p className="mt-2 text-xs text-ink/60">
                  Penjualan {formatRupiah(e.grossRupiah)} − refund selesai {formatRupiah(e.refundedRupiah)}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {e.blockedBy === null ? (
                    <Button loading={busyId === e.eventId} disabled={busyId === e.eventId} onClick={() => void request(e.eventId)}>
                      Ajukan pencairan
                    </Button>
                  ) : (
                    <p className="text-sm text-ink/65">
                      {e.payout && e.payout.status !== "REJECTED"
                        ? `${e.payout.payoutNumber} — ${STATUS_LABEL[e.payout.status]}`
                        : BLOCK_TEXT[e.blockedBy] || "Belum dapat dicairkan."}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data && data.items.length > 0 ? (
        <section aria-labelledby="payout-history">
          <h2 id="payout-history" className="mb-2 text-base font-semibold text-ink">
            Riwayat pencairan
          </h2>
          <ul className="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">
            {data.items.map((p) => (
              <li key={p.id} className="p-4 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium text-ink">
                    {p.payoutNumber} · {p.eventTitle}
                  </span>
                  <span className="font-semibold text-ink">{formatRupiah(p.amountRupiah)}</span>
                </div>
                <p className="text-xs text-ink/60">
                  {STATUS_LABEL[p.status]} · {p.bankName} {p.accountNumber}
                  {p.paidAt ? ` · ${formatDateTime(p.paidAt)}` : p.requestedAt ? ` · diajukan ${formatDateTime(p.requestedAt)}` : ""}
                </p>
                {p.status === "REJECTED" && p.decisionReason ? (
                  <p className="mt-1 text-xs text-ink/70">Alasan: {p.decisionReason}</p>
                ) : null}
                {p.status === "PAID" && p.hasTransferProof ? (
                  <a className="mt-1 inline-block text-xs text-gold-700 underline" href={`/api/organizer/payouts/${p.id}/proof`} target="_blank" rel="noreferrer">
                    Lihat bukti transfer
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
