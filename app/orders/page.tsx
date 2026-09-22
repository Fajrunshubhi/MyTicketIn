"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatRupiah } from "@/lib/format";

type Row = {
  id: string;
  orderNumber: string;
  status: string;
  totalPayableRupiah: number;
  expiresAt: string;
  event?: { title?: string };
};

export default function OrdersPage() {
  const router = useRouter();
  const [items, setItems] = useState<Row[]>([]);
  useEffect(() => {
    fetch("/api/me", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          return;
        }
        const body = (await res.json()) as { data?: { access?: { canBuy?: boolean } } };
        if (body.data?.access?.canBuy === false) {
          router.replace("/dashboard");
        }
      })
      .catch(() => undefined);
  }, [router]);
  useEffect(() => {
    fetch("/api/orders", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((body) => setItems(((body.data as { items?: Row[] })?.items || [])))
      .catch(() => setItems([]));
  }, []);
  return (
    <div>
      {items.length === 0 ? <p className="text-ink/65">Belum ada order.</p> : null}
      <ul className="mt-6 space-y-3">
          {items.map((o) => (
            <li key={o.id} className="rounded-xl border border-stone-200 p-4">
              <Link href={`/orders/${o.id}`} className="text-gold-700 underline">
                {o.orderNumber}
              </Link>
              <p className="text-sm text-ink/70">
                {o.event?.title} · {o.status} · {formatRupiah(o.totalPayableRupiah)}
              </p>
            </li>
          ))}
        </ul>
    </div>
  );
}
