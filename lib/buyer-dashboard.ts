export type BuyerMonthSpend = {
  key: string;
  label: string;
  spentRupiah: number;
  orders: number;
};

export type BuyerStatusSlice = {
  status: string;
  label: string;
  count: number;
};

export type BuyerEventSpend = {
  eventId: string;
  title: string;
  spentRupiah: number;
  orders: number;
};

export const BUYER_EVENT_CHART_LIMIT = 5;

export const BUYER_STATUS_LABEL: Record<string, string> = {
  PAID: "Lunas",
  PENDING: "Menunggu bayar",
  EXPIRED: "Kedaluwarsa",
  FAILED: "Gagal",
  CANCELLED: "Dibatalkan",
  REFUNDED: "Direfund",
};

export function orderStatusLabel(status: string): string {
  return BUYER_STATUS_LABEL[status] || status;
}

/** Enam bulan kalender Asia/Jakarta, termasuk bulan berjalan, diisi 0 jika tidak ada transaksi. */
export function fillMonthlySpend(
  nowMs: number,
  rows: { key: string; spentRupiah: number; orders: number }[],
  months = 6,
): BuyerMonthSpend[] {
  const map = new Map(rows.map((row) => [row.key, row]));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date(nowMs));
  let year = Number(parts.find((p) => p.type === "year")?.value);
  let month = Number(parts.find((p) => p.type === "month")?.value);
  const labelFmt = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", month: "short" });
  const out: BuyerMonthSpend[] = [];
  for (let i = 0; i < months; i += 1) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const found = map.get(key);
    out.unshift({
      key,
      label: labelFmt.format(new Date(Date.UTC(year, month - 1, 1))),
      spentRupiah: Math.max(0, Math.trunc(found?.spentRupiah || 0)),
      orders: Math.max(0, Math.trunc(found?.orders || 0)),
    });
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }
  return out;
}

export function compactRupiah(amount: number): string {
  const n = Math.max(0, Math.trunc(amount));
  if (n >= 1_000_000) {
    const tenth = Math.round(n / 100_000);
    const whole = Math.trunc(tenth / 10);
    const frac = tenth % 10;
    return frac === 0 ? `Rp${whole} jt` : `Rp${whole},${frac} jt`;
  }
  if (n >= 1_000) return `Rp${Math.round(n / 1000)} rb`;
  return `Rp${n}`;
}

export function withOtherEvents(
  top: BuyerEventSpend[],
  other: { eventCount: number; spentRupiah: number; orders: number },
): BuyerEventSpend[] {
  if (other.eventCount <= 0 || other.spentRupiah <= 0) return top.slice(0, BUYER_EVENT_CHART_LIMIT);
  return [
    ...top.slice(0, BUYER_EVENT_CHART_LIMIT),
    {
      eventId: "lainnya",
      title: `Lainnya (${other.eventCount} event)`,
      spentRupiah: Math.max(0, Math.trunc(other.spentRupiah)),
      orders: Math.max(0, Math.trunc(other.orders)),
    },
  ];
}

export function statusSlices(rows: { status: string; count: number }[]): BuyerStatusSlice[] {
  return rows
    .map((row) => ({
      status: row.status,
      label: orderStatusLabel(row.status),
      count: Math.max(0, Math.trunc(row.count || 0)),
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
}
