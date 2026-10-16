"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EventCard } from "@/components/events/EventCard";
import { type CatalogCard } from "@/components/events/catalog-types";
import { type AccountProfile, roleLabel } from "@/lib/account";
import { formatRupiah } from "@/lib/format";
import { Icon, type IconName } from "@/components/ui/Icon";
import { subscribeNotificationsLive } from "@/lib/notifications-live";
import { NotificationHoverItem } from "@/components/notifications/NotificationHoverItem";
import {
  BuyerOverviewCharts,
  NextTicketCard,
  type BuyerDashboardData,
} from "@/components/dashboard/BuyerOverviewCharts";

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

function KpiLink({
  href,
  label,
  value,
  hint,
  icon,
}: {
  href: string;
  label: string;
  value: string;
  hint: string;
  icon: IconName;
}) {
  return (
    <li>
      <Link href={href} className="block rounded-3xl bg-white p-5 shadow-sm transition hover:bg-stone-50">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/45">{label}</p>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-gold-50 text-gold-700">
            <Icon name={icon} className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-2 break-all text-2xl font-semibold tabular-nums text-ink sm:text-3xl">{value}</p>
        <p className="mt-1 text-xs text-ink/45">{hint}</p>
      </Link>
    </li>
  );
}

export function BuyerWorkspace() {
  const router = useRouter();
  const [me, setMe] = useState<AccountProfile | null>(null);
  const [events, setEvents] = useState<CatalogCard[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [paidOrderCount, setPaidOrderCount] = useState(0);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [overview, setOverview] = useState<BuyerDashboardData | null>(null);
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
        const [evRes, orRes, tiRes, noRes, dashRes] = await Promise.all([
          fetch("/api/events?limit=8", { credentials: "include", cache: "no-store" }),
          fetch("/api/orders", { credentials: "include", cache: "no-store" }),
          fetch("/api/tickets", { credentials: "include", cache: "no-store" }),
          fetch("/api/me/notifications?filter=all&limit=8", { credentials: "include", cache: "no-store" }),
          fetch("/api/me/dashboard", { credentials: "include", cache: "no-store" }),
        ]);
        if (evRes.status === 401) {
          router.replace("/login?callbackUrl=/dashboard");
          return;
        }
        const evBody = await evRes.json().catch(() => ({}));
        const orBody = await orRes.json().catch(() => ({}));
        const tiBody = await tiRes.json().catch(() => ({}));
        const noBody = await noRes.json().catch(() => ({}));
        const dashBody = await dashRes.json().catch(() => ({}));
        if (cancelled) return;
        setEvents((evBody.data?.items || []) as CatalogCard[]);
        const orderItems = (orBody.data?.items || []) as OrderRow[];
        setOrders(orderItems);
        const dash = (dashBody.data || null) as BuyerDashboardData | null;
        setOverview(dash);
        setPaidOrderCount(
          typeof dash?.paidOrderCount === "number"
            ? dash.paidOrderCount
            : typeof orBody.data?.paidCount === "number"
              ? orBody.data.paidCount
              : orderItems.filter((o) => o.status === "PAID").length,
        );
        setTickets((tiBody.data?.items || []) as TicketRow[]);
        setNotices((noBody.data?.items || []) as Notice[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const stop = subscribeNotificationsLive(() => {
      fetch("/api/me/notifications?filter=all&limit=8", { credentials: "include", cache: "no-store" })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!cancelled && res.ok) setNotices((body.data?.items || []) as Notice[]);
        })
        .catch(() => undefined);
    });
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/me/notifications?filter=all&limit=8", { credentials: "include", cache: "no-store" })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!cancelled && res.ok) setNotices((body.data?.items || []) as Notice[]);
        })
        .catch(() => undefined);
    }, 4000);
    return () => {
      cancelled = true;
      stop();
      window.clearInterval(timer);
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
        <KpiLink
          href="/dashboard/order?status=PAID"
          label="Pengeluaran"
          value={overview ? formatRupiah(overview.spentRupiah) : "Rp0"}
          hint={overview?.refundedRupiah ? `Refund ${formatRupiah(overview.refundedRupiah)}` : "Total order lunas"}
          icon="chart"
        />
        <KpiLink
          href="/dashboard/order?status=PAID"
          label="Order"
          value={String(paidOrderCount)}
          hint={overview?.pendingOrderCount ? `${overview.pendingOrderCount} menunggu bayar` : "Hanya order lunas"}
          icon="orders"
        />
        <KpiLink
          href="/dashboard/ticket"
          label="Tiket aktif"
          value={String(overview?.activeTicketCount ?? tickets.length)}
          hint="Tiket belum dipakai untuk event mendatang"
          icon="ticket"
        />
        <KpiLink
          href="/dashboard/poin"
          label="Poin loyalty"
          value={String(overview?.loyaltyPoints ?? 0)}
          hint={unread ? `${unread} notifikasi belum dibaca` : "Tidak bernilai tunai"}
          icon="bell"
        />
      </ul>

      {overview?.nextTicket ? <NextTicketCard ticket={overview.nextTicket} /> : null}
      {overview ? <BuyerOverviewCharts data={overview} /> : null}

      {applying ? (
        <p className="mt-4 text-sm text-ink/65">
          Ingin menjual tiket?{" "}
          <Link href="/dashboard/organizer/apply" className="font-medium text-gold-700">
            Ajukan sebagai penyelenggara
          </Link>
          {" · "}
          <Link href="/dashboard/organizer/status" className="font-medium text-gold-700">
            Cek status pengajuan
          </Link>
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_18.5rem]">
        <section className="rounded-3xl bg-white p-5 shadow-sm" aria-labelledby="buyer-upcoming">
          <div className="flex items-center justify-between gap-3">
            <h2 id="buyer-upcoming" className="text-lg font-semibold text-ink">Event mendatang</h2>
            <Link href="/dashboard/events" className="text-sm text-gold-700">Semua</Link>
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
            <Link href="/dashboard/notifications" className="text-sm text-gold-700">Semua</Link>
          </div>
          {notices.length === 0 ? (
            <p className="mt-6 text-sm text-ink/55">Belum ada notifikasi.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {notices.slice(0, 5).map((n) => (
                <li key={n.id}>
                  <NotificationHoverItem item={n} fallbackHref="/dashboard/notifications" compact />
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
            <Link href="/dashboard/order" className="text-sm text-gold-700">Semua</Link>
          </div>
          {orders.length === 0 ? (
            <p className="mt-4 text-sm text-ink/55">Belum ada order. Checkout berbayar belum diimplementasikan.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {orders.slice(0, 5).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 text-sm">
                  <Link href={`/dashboard/order/${o.id}`} className="font-medium text-gold-700">
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
            <Link href="/dashboard/ticket" className="text-sm text-gold-700">Semua</Link>
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
                  <Link href={`/dashboard/ticket/${t.id}`} className="font-medium text-gold-700">
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
