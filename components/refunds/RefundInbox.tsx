"use client";

import { useMemo, useState, type ReactNode } from "react";
import { refundStatusUiLabel } from "@/lib/order-refund-display";
import { formatRupiah } from "@/lib/format";

export type RefundInboxItem = {
  id: string;
  refundNumber: string;
  eventTitle?: string;
  orderNumber?: string;
  amountRupiah: number;
  status: string;
  viaMidtrans?: boolean;
  requestedAt?: string | null;
};

function statusClass(status: string) {
  if (status === "COMPLETED") return "bg-emerald-50 text-emerald-800";
  if (status === "REJECTED" || status === "FAILED") return "bg-red-50 text-red-800";
  if (status === "PROCESSING" || status === "APPROVED") return "bg-amber-50 text-amber-900";
  return "bg-[#eee8ff] text-gold-800";
}

export function RefundInbox({
  items,
  selectedId,
  onSelect,
  filters,
  activeFilter,
  onFilter,
  detail,
  emptyLabel,
  listLabel = "Daftar refund",
}: {
  items: RefundInboxItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  filters?: { id: string; label: string }[];
  activeFilter?: string;
  onFilter?: (id: string) => void;
  detail: ReactNode;
  emptyLabel: string;
  listLabel?: string;
}) {
  const [q, setQ] = useState("");
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      `${item.refundNumber} ${item.eventTitle || ""} ${item.orderNumber || ""} ${item.status}`.toLowerCase().includes(needle),
    );
  }, [items, q]);
  const selected = visible.find((item) => item.id === selectedId) || items.find((item) => item.id === selectedId);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:items-start">
      <aside className="rounded-3xl border border-stone-200 bg-white shadow-sm lg:sticky lg:top-4">
        <div className="border-b border-stone-100 p-4">
          <label className="block text-sm">
            <span className="sr-only">Cari refund</span>
            <input
              className="h-11 w-full rounded-xl border border-stone-200 px-3 text-sm"
              placeholder="Cari nomor, event, atau order"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          {filters?.length ? (
            <nav className="mt-3 flex flex-wrap gap-2" aria-label="Filter refund">
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onFilter?.(f.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    activeFilter === f.id ? "bg-gold-500 text-white" : "border border-stone-200 bg-white text-ink/70"
                  }`}
                  aria-current={activeFilter === f.id ? "page" : undefined}
                >
                  {f.label}
                </button>
              ))}
            </nav>
          ) : null}
        </div>
        <ul className="max-h-[28rem] overflow-y-auto p-2 lg:max-h-[min(70vh,40rem)]" aria-label={listLabel}>
          {visible.map((item) => {
            const active = item.id === selected?.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={`mb-1 w-full rounded-2xl px-3 py-3 text-left ${
                    active ? "bg-[#f4f0ff] ring-1 ring-gold-300" : "hover:bg-stone-50"
                  }`}
                  aria-current={active ? "true" : undefined}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium uppercase tracking-wide text-ink/45">
                        {item.refundNumber}
                      </span>
                      <span className="mt-0.5 block truncate font-semibold text-ink">{item.eventTitle || "Event"}</span>
                      <span className="mt-0.5 block truncate text-sm text-ink/60">
                        {item.orderNumber || "—"} · {formatRupiah(item.amountRupiah)}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(item.status)}`}>
                      {refundStatusUiLabel(item.status, item.viaMidtrans)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {visible.length === 0 ? <li className="px-3 py-8 text-center text-sm text-ink/55">{emptyLabel}</li> : null}
        </ul>
      </aside>
      <section className="min-h-[18rem] rounded-3xl border border-stone-200 bg-white p-5 shadow-sm md:p-6">
        {selected ? detail : <p className="text-sm text-ink/55">Pilih refund di daftar untuk melihat detail.</p>}
      </section>
    </div>
  );
}

export function MidtransRefundNote() {
  return (
    <details className="rounded-2xl border border-stone-200 bg-[#f7f5fc] px-4 py-3 text-sm text-ink/75">
      <summary className="cursor-pointer font-semibold text-ink">Status di dashboard Midtrans</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          <strong>QRIS / e-wallet:</strong> setelah refund API berhasil, transaksi berubah menjadi refund/partial_refund.
          Total pendapatan merchant berkurang sesuai nominal yang dikembalikan.
        </li>
        <li>
          <strong>Virtual account:</strong> Midtrans tidak menyediakan Refund API. Dashboard tetap menampilkan Settlement
          dan pendapatan bruto. Pengembalian dicatat di MyTicketIn lalu merchant mentransfer ke rekening pembeli.
        </li>
      </ul>
    </details>
  );
}
