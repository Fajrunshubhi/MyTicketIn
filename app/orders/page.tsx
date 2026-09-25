"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BuyerShell } from "@/components/dashboard/BuyerShell";
import { Icon } from "@/components/ui/Icon";
import { formatDateTime, formatRupiah } from "@/lib/format";
import { downloadOrderReceiptPdf } from "@/lib/order-receipt-pdf";

type Row = {
  id: string;
  orderNumber: string;
  status: string;
  totalPayableRupiah: number;
  expiresAt: string | null;
  createdAt: string | null;
  event?: {
    title?: string;
    slug?: string;
    startsAt?: string | null;
    timezone?: string;
    venueName?: string;
    city?: string;
  };
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu pembayaran",
  PAID: "Lunas",
  EXPIRED: "Kedaluwarsa",
  CANCELLED: "Dibatalkan",
  FAILED: "Gagal",
};

const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Semua" },
  { value: "PENDING", label: "Menunggu bayar" },
  { value: "PAID", label: "Lunas" },
  { value: "EXPIRED", label: "Kedaluwarsa" },
];

function statusClass(status: string) {
  if (status === "PAID") return "bg-emerald-50 text-emerald-800";
  if (status === "PENDING") return "bg-[#eee8ff] text-gold-800";
  if (status === "EXPIRED" || status === "FAILED" || status === "CANCELLED") return "bg-stone-100 text-ink/60";
  return "bg-stone-100 text-ink/70";
}

function eventWhen(row: Row) {
  if (!row.event?.startsAt) return "";
  try {
    return formatDateTime(row.event.startsAt, row.event.timezone || "Asia/Jakarta");
  } catch {
    return "";
  }
}

function OrdersRoute() {
  const router = useRouter();
  const params = useSearchParams();
  const status = (params.get("status") || "").toUpperCase();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfId, setPdfId] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState("");

  async function downloadReceipt(id: string) {
    setPdfId(id);
    setPdfError("");
    try {
      const res = await fetch(`/api/orders/${id}`, {
        credentials: "include",
        cache: "no-store",
        headers: { "X-Silent-Loading": "1" },
      });
      const body = await res.json();
      const order = (body.data as { order?: Parameters<typeof downloadOrderReceiptPdf>[0] } | undefined)?.order;
      if (!res.ok || !order) {
        setPdfError("Receipt PDF gagal diunduh. Coba lagi.");
        return;
      }
      await downloadOrderReceiptPdf(order);
    } catch {
      setPdfError("Receipt PDF gagal diunduh. Coba lagi.");
    } finally {
      setPdfId(null);
    }
  }

  useEffect(() => {
    fetch("/api/me", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { data?: { access?: { canBuy?: boolean } } };
        if (body.data?.access?.canBuy === false) router.replace("/dashboard");
      })
      .catch(() => undefined);
  }, [router]);

  useEffect(() => {
    setLoading(true);
    fetch("/api/orders", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((body) => setItems((body.data as { items?: Row[] })?.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => (status ? items.filter((o) => o.status === status) : items), [items, status]);
  const pendingCount = items.filter((o) => o.status === "PENDING").length;

  return (
    <BuyerShell>
      <div>
        <p className="text-sm text-ink/65">Riwayat pembelian tiket. Order menunggu bayar hanya berlaku sampai waktu hold habis.</p>
        {pendingCount > 0 ? (
          <p className="mt-3 rounded-2xl bg-[#eee8ff] px-4 py-2 text-sm font-medium text-gold-800" role="status">
            {pendingCount} order menunggu pembayaran.
          </p>
        ) : null}

        {pdfError ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {pdfError}
          </p>
        ) : null}

        <nav aria-label="Filter status order" className="mt-5 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const on = status === f.value;
            return (
              <Link
                key={f.value || "all"}
                href={f.value ? `/orders?status=${f.value}` : "/orders"}
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium ${
                  on ? "bg-gold-500 text-white" : "border border-stone-200 bg-white text-ink/75 hover:bg-stone-50"
                }`}
              >
                {f.label}
              </Link>
            );
          })}
        </nav>

        {loading ? <p className="mt-8 text-sm text-ink/55">Memuat order…</p> : null}
        {!loading && visible.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-stone-200 bg-white p-8 text-center">
            <p className="font-semibold text-ink">Belum ada order{status ? ` dengan status ini` : ""}.</p>
            <p className="mt-1 text-sm text-ink/60">Pilih event, lalu selesaikan checkout untuk melihat riwayat di sini.</p>
            <Link
              href="/dashboard/events"
              className="mt-4 inline-flex min-h-11 items-center rounded-full bg-gold-500 px-4 text-sm font-semibold text-white"
            >
              Lihat event
            </Link>
          </div>
        ) : null}

        <ul className="mt-6 grid gap-4">
          {visible.map((o) => {
            const when = eventWhen(o);
            const place = [o.event?.venueName, o.event?.city].filter(Boolean).join(" · ");
            return (
              <li key={o.id}>
                <article className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-ink/45">{o.orderNumber}</p>
                      <h2 className="mt-1 text-lg font-semibold text-ink">{o.event?.title || "Event"}</h2>
                      {when ? (
                        <p className="mt-2 flex items-center gap-2 text-sm text-ink/65">
                          <Icon name="calendar" className="h-4 w-4 text-gold-600" />
                          {when}
                        </p>
                      ) : null}
                      {place ? (
                        <p className="mt-1 flex items-center gap-2 text-sm text-ink/55">
                          <Icon name="pin" className="h-4 w-4 text-gold-600" />
                          {place}
                        </p>
                      ) : null}
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(o.status)}`}>
                      {STATUS_LABEL[o.status] || o.status}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
                    <p className="text-base font-semibold text-ink">{formatRupiah(o.totalPayableRupiah)}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={pdfId === o.id}
                        onClick={() => void downloadReceipt(o.id)}
                        className="inline-flex min-h-11 items-center rounded-full border border-stone-200 px-4 text-sm font-semibold text-ink hover:bg-stone-50 disabled:opacity-60"
                      >
                        {pdfId === o.id ? "Menyiapkan PDF…" : "Unduh receipt"}
                      </button>
                      <Link
                        href={`/orders/${o.id}`}
                        className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${
                          o.status === "PENDING" ? "bg-gold-500 text-white" : "border border-stone-200 text-ink hover:bg-stone-50"
                        }`}
                      >
                        {o.status === "PENDING" ? "Bayar sekarang" : "Lihat detail"}
                      </Link>
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </div>
    </BuyerShell>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<BuyerShell><p className="text-ink/55">Memuat order…</p></BuyerShell>}>
      <OrdersRoute />
    </Suspense>
  );
}
