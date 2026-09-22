"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";

type TicketRow = {
  id: string;
  ticketNumber: string;
  status: string;
  issuedAt: string;
  event?: { slug?: string; title?: string; startsAt?: string; timezone?: string; venueName?: string; city?: string };
  ticketType?: { name?: string };
};

const STATUS_LABEL: Record<string, string> = {
  UNUSED: "Belum digunakan",
  USED: "Sudah digunakan",
  CANCELLED: "Dibatalkan",
};

export default function TicketsRoute() {
  return (
    <Suspense fallback={<p className="p-6 text-ink/70">Memuat tiket…</p>}>
      <TicketsPage />
    </Suspense>
  );
}

function TicketsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const status = (params.get("status") || "").toUpperCase();
  const [items, setItems] = useState<TicketRow[]>([]);
  const [error, setError] = useState("");

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
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    fetch(`/api/tickets${q}`, { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) {
          setError(body.error?.message || "Wallet tiket gagal dimuat.");
          setItems([]);
          return;
        }
        setError("");
        setItems(((body.data as { items?: TicketRow[] })?.items || []));
      })
      .catch(() => setError("Wallet tiket gagal dimuat."));
  }, [status]);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const as = a.event?.startsAt || "";
      const bs = b.event?.startsAt || "";
      return as.localeCompare(bs);
    });
  }, [items]);

  return (
    <div>
        <p className="text-ink/65">Tiket privat milik akun Anda. Jangan bagikan kode QR.</p>
        <nav aria-label="Filter status tiket" className="mt-4 flex flex-wrap gap-3 text-sm">
          {[
            ["", "Semua"],
            ["UNUSED", "Belum digunakan"],
            ["USED", "Sudah digunakan"],
            ["CANCELLED", "Dibatalkan"],
          ].map(([value, label]) => (
            <Link
              key={value || "all"}
              href={value ? `/tickets?status=${value}` : "/tickets"}
              className={`rounded-full border px-3 py-1 ${status === value ? "border-gold-400 text-gold-700" : "border-stone-300 text-ink/80"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        {error ? <div className="mt-4"><Alert tone="error" title={error} /></div> : null}
        {sorted.length === 0 && !error ? <p className="mt-6 text-ink/65">Belum ada tiket.</p> : null}
        <ul className="mt-6 space-y-3">
          {sorted.map((t) => (
            <li key={t.id} className="rounded-2xl border border-stone-200 p-5">
              <Link href={`/tickets/${t.id}`} className="block min-h-11">
                <p className="text-lg font-semibold text-ink">{t.event?.title || "Event"}</p>
                <p className="text-sm text-ink/70">
                  {t.ticketType?.name} · {STATUS_LABEL[t.status] || t.status}
                </p>
                <p className="text-sm text-ink/55">
                  {t.event?.venueName} · {t.event?.city}
                </p>
                <p className="mt-1 text-gold-700 underline">Detail tiket {t.ticketNumber}</p>
              </Link>
            </li>
          ))}
        </ul>
    </div>
  );
}
