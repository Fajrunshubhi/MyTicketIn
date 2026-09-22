"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EventCard } from "@/components/events/EventCard";
import { type CatalogCard } from "@/components/events/catalog-types";
import { type AccountProfile, roleLabel } from "@/lib/account";
import { formatRupiah } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  totalPayableRupiah: number;
  event?: { title?: string };
};

type TicketRow = {
  id: string;
  ticketNumber: string;
  status: string;
  event?: { title?: string };
};

type Notice = { id: string; title: string; body: string; createdAt: string; readAt: string | null; actionPath: string | null };

export function BuyerWorkspace() {
  const router = useRouter();
  const [me, setMe] = useState<AccountProfile | null>(null);
  const [events, setEvents] = useState<CatalogCard[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const meRes = await fetch("/api/me", { credentials: "include", cache: "no-store" });
        if (meRes.status === 401) {
          router.replace("/login?callbackUrl=/dashboard");
          return;
        }
        const meBody = await meRes.json().catch(() => ({}));
        if (!cancelled) setMe((meBody.data || null) as AccountProfile | null);
        const [evRes, orRes, tiRes, noRes] = await Promise.all([
          fetch("/api/events?limit=8", { credentials: "include", cache: "no-store" }),
          fetch("/api/orders", { credentials: "include", cache: "no-store" }),
          fetch("/api/tickets", { credentials: "include", cache: "no-store" }),
          fetch("/api/me/notifications?filter=all&limit=8", { credentials: "include", cache: "no-store" }),
        ]);
        if (evRes.status === 401) {
          router.replace("/login?callbackUrl=/dashboard");
          return;
        }
        const evBody = await evRes.json().catch(() => ({}));
        const orBody = await orRes.json().catch(() => ({}));
        const tiBody = await tiRes.json().catch(() => ({}));
        const noBody = await noRes.json().catch(() => ({}));
        if (cancelled) return;
        setEvents((evBody.data?.items || []) as CatalogCard[]);
        setOrders((orBody.data?.items || []) as OrderRow[]);
        setTickets((tiBody.data?.items || []) as TicketRow[]);
        setNotices((noBody.data?.items || []) as Notice[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const unread = notices.filter((n) => !n.readAt).length;
  const applying = Boolean(me?.access?.canApplyOrganizer);

  return (
    <div>
      <p className="text-sm text-gold-800">Akun pembeli · {me ? roleLabel(me) : "Pembeli tiket"}</p>
      <p className="mt-1 text-lg font-semibold text-ink">Halo, {me?.name || me?.username || "pembeli"}</p>
      {loading ? <p role="status" className="mt-4 text-ink/60">Memuat dashboard pembeli…</p> : null}

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <li className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/45">Event mendatang</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{events.length}</p>
        </li>
        <li className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/45">Order</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{orders.length}</p>
        </li>
        <li className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/45">Tiket</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{tickets.length}</p>
        </li>
        <li className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/45">Notifikasi belum dibaca</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{unread}</p>
        </li>
      </ul>

      {applying ? (
        <p className="mt-4 text-sm text-ink/65">
          Ingin menjual tiket?{" "}
          <Link href="/organizer/apply" className="font-medium text-gold-700">
            Ajukan sebagai penyelenggara
          </Link>
          {" · "}
          <Link href="/organizer/status" className="font-medium text-gold-700">
            Cek status pengajuan
          </Link>
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_18.5rem]">
        <section className="rounded-3xl bg-white p-5 shadow-sm" aria-labelledby="buyer-upcoming">
          <div className="flex items-center justify-between gap-3">
            <h2 id="buyer-upcoming" className="text-lg font-semibold text-ink">Event mendatang</h2>
            <Link href="/events" className="text-sm text-gold-700">Katalog</Link>
          </div>
          {events.length === 0 ? (
            <p className="mt-6 text-sm text-ink/55">Belum ada event terbit. Pembayaran dan tiket QR belum diaktifkan.</p>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {events.slice(0, 4).map((item) => (
                <EventCard key={item.slug} item={item} />
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-3xl bg-white p-5 shadow-sm" aria-labelledby="buyer-notif">
          <div className="flex items-center justify-between gap-3">
            <h2 id="buyer-notif" className="text-lg font-semibold text-ink">Notifikasi</h2>
            <Link href="/notifications" className="text-sm text-gold-700">Semua</Link>
          </div>
          {notices.length === 0 ? (
            <p className="mt-6 text-sm text-ink/55">Belum ada notifikasi.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {notices.slice(0, 5).map((n) => (
                <li key={n.id}>
                  <p className="text-sm font-semibold text-ink">{n.title}</p>
                  <p className="text-sm text-ink/65">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Order terbaru</h2>
            <Link href="/orders" className="text-sm text-gold-700">Semua</Link>
          </div>
          {orders.length === 0 ? (
            <p className="mt-4 text-sm text-ink/55">Belum ada order. Checkout berbayar belum diimplementasikan.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {orders.slice(0, 5).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 text-sm">
                  <Link href={`/orders/${o.id}`} className="font-medium text-gold-700">
                    {o.orderNumber}
                  </Link>
                  <span className="text-ink/60">
                    {o.status} · {formatRupiah(o.totalPayableRupiah)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Tiket saya</h2>
            <Link href="/tickets" className="text-sm text-gold-700">Semua</Link>
          </div>
          {tickets.length === 0 ? (
            <p className="mt-4 flex items-start gap-2 text-sm text-ink/55">
              <Icon name="ticket" className="mt-0.5 h-4 w-4 shrink-0" />
              Belum ada tiket. E-ticket dan kode QR belum diimplementasikan.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {tickets.slice(0, 5).map((t) => (
                <li key={t.id} className="text-sm">
                  <Link href={`/tickets/${t.id}`} className="font-medium text-gold-700">
                    {t.ticketNumber}
                  </Link>
                  <p className="text-ink/60">
                    {t.event?.title} · {t.status}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
