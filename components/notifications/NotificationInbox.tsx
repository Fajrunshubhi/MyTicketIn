"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { apiFetch, readApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { isNotificationType, NOTIFICATION_TYPE_LABEL } from "@/lib/server/notification-types";

type Item = {
  id: string;
  type: string;
  title: string;
  body: string;
  actionPath: string | null;
  createdAt: string;
  readAt: string | null;
};

function typeLabel(type: string): string {
  return isNotificationType(type) ? NOTIFICATION_TYPE_LABEL[type] : "Pembaruan";
}

export function NotificationInbox() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  function load(nextFilter = filter) {
    setLoading(true);
    fetch(`/api/me/notifications?filter=${nextFilter}&limit=50`, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(readApiError(body, "Gagal memuat notifikasi."));
          setLoading(false);
          return;
        }
        setItems((body.data?.items || []) as Item[]);
        setUnread(Number(body.data?.unreadCount || 0));
        setError("");
        setLoading(false);
      })
      .catch(() => {
        setError("Tidak dapat terhubung ke layanan.");
        setLoading(false);
      });
  }

  useEffect(() => {
    load("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function mark(id: string) {
    const res = await apiFetch(`/api/me/notifications/${id}/read`, { method: "POST" });
    if (res.ok) load(filter);
  }

  async function markAll() {
    const res = await apiFetch("/api/me/notifications/read-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (res.ok) load(filter);
  }

  return (
    <div>
      <p className="max-w-2xl text-ink/65">
        Inbox akun ini hanya menampilkan peristiwa yang menyangkut Anda: pembayaran dan tiket (pembeli), hasil moderasi dan penjualan (penyelenggara), atau antrean tinjauan (admin). Bukan newsletter.
      </p>
      <p className="mt-4 flex flex-wrap gap-3">
        <Button type="button" variant={filter === "all" ? "primary" : "secondary"} onClick={() => { setFilter("all"); load("all"); }}>
          Semua
        </Button>
        <Button type="button" variant={filter === "unread" ? "primary" : "secondary"} onClick={() => { setFilter("unread"); load("unread"); }}>
          Belum dibaca
        </Button>
        <Button type="button" variant="secondary" onClick={markAll}>
          Tandai semua dibaca
        </Button>
      </p>
      {loading ? <div className="mt-6"><LoadingState /></div> : null}
      {error ? <div className="mt-6"><Alert tone="error" title={error} /></div> : null}
      <p className="mt-4 text-sm text-ink/55" aria-live="polite">{unread} belum dibaca</p>
      <ul className="mt-6 grid gap-3">
        {items.map((item) => (
          <li key={item.id} className={`rounded-2xl border p-4 ${item.readAt ? "border-stone-200 bg-white" : "border-gold-400/40 bg-gold-50/40"}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/45">{typeLabel(item.type)}</p>
            <p className="mt-1 font-semibold text-ink">{item.title}</p>
            <p className="mt-1 text-sm text-ink/70">{item.body}</p>
            <p className="mt-2 text-xs text-ink/45">{formatDateTime(item.createdAt)} {item.readAt ? "· sudah dibaca" : "· belum dibaca"}</p>
            <p className="mt-3 flex flex-wrap gap-3 text-sm">
              {item.actionPath ? <Link className="text-gold-700 underline-offset-2 hover:underline" href={item.actionPath}>Buka</Link> : null}
              {!item.readAt ? (
                <button type="button" className="text-gold-700 underline-offset-2 hover:underline" onClick={() => mark(item.id)}>Tandai dibaca</button>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
      {!loading && items.length === 0 ? (
        <p className="mt-6 text-ink/65">Belum ada notifikasi. Pesan muncul setelah pembayaran, tiket, moderasi, pembatalan, refund, atau pengingat H-1.</p>
      ) : null}
    </div>
  );
}
