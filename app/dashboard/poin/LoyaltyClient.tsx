"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { readApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type Account = {
  organizerId: string;
  organizerName: string;
  balancePoints: number;
  debtPoints: number;
  reservedPoints: number;
  availablePoints: number;
};

type Entry = {
  id: string;
  organizerName: string;
  entryType: string;
  pointsDelta: number;
  orderNumber: string | null;
  occurredAt: string;
};

const ENTRY_LABEL: Record<string, string> = {
  EARN: "Poin diperoleh",
  REDEEM_DEBIT: "Poin dipakai",
  EARN_REVERSAL: "Poin dibatalkan (refund)",
  REDEEM_RESTORE: "Poin dikembalikan (refund)",
};

export function LoyaltyClient() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [ledger, setLedger] = useState<Entry[]>([]);
  const [rate, setRate] = useState({ rupiahPerPoint: 10, maxCheckoutPercent: 20 });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me/loyalty", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(readApiError(body, "Gagal memuat poin."));
          return;
        }
        setAccounts((body.data?.accounts || []) as Account[]);
        setLedger((body.data?.ledger || []) as Entry[]);
        if (body.data?.rate) setRate(body.data.rate);
      })
      .catch(() => setError("Tidak dapat terhubung ke layanan."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Poin berlaku per penyelenggara. Setiap Rp1.000 pembayaran bersih menghasilkan 1 poin; 1 poin bernilai Rp
        {rate.rupiahPerPoint} sebagai potongan, maksimal {rate.maxCheckoutPercent}% dari order. Poin tidak dapat
        diuangkan atau dipindahkan.
      </p>
      {error ? <Alert tone="error" title={error} /> : null}
      {loading ? <p className="text-sm text-slate-500">Memuat…</p> : null}

      {!loading && !error && accounts.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Belum ada poin. Poin muncul setelah Anda menyelesaikan pembayaran tiket.
        </p>
      ) : null}

      {accounts.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Saldo poin per penyelenggara">
          {accounts.map((a) => (
            <li key={a.organizerId} className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="font-medium text-slate-900">{a.organizerName}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{a.availablePoints.toLocaleString("id-ID")} poin</p>
              <p className="mt-1 text-xs text-slate-500">
                Saldo {a.balancePoints.toLocaleString("id-ID")}
                {a.reservedPoints > 0 ? ` · tertahan di checkout ${a.reservedPoints.toLocaleString("id-ID")}` : ""}
                {a.debtPoints > 0 ? ` · utang ${a.debtPoints.toLocaleString("id-ID")}` : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {ledger.length > 0 ? (
        <section aria-labelledby="loyalty-history">
          <h2 id="loyalty-history" className="mb-2 text-base font-semibold text-slate-900">
            Riwayat poin
          </h2>
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {ledger.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900">{ENTRY_LABEL[e.entryType] || e.entryType}</p>
                  <p className="text-xs text-slate-500">
                    {e.organizerName}
                    {e.orderNumber ? ` · ${e.orderNumber}` : ""} · {formatDateTime(e.occurredAt)}
                  </p>
                </div>
                <span className={e.pointsDelta >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
                  {e.pointsDelta > 0 ? "+" : ""}
                  {e.pointsDelta.toLocaleString("id-ID")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
