"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { apiFetch, readApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type Item = {
  id: string;
  type: string;
  title: string;
  body: string;
  actionPath: string | null;
  createdAt: string;
  readAt: string | null;
};

export function NotificationInbox() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  function load(nextFilter = filter) {
    setLoading(true);
    fetch(`/api/me/notifications?filter=${nextFilter}`, { credentials: "include", cache: "no-store" })
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
      <p className="text-ink/65">Pesan akun. Tidak memuat token QR atau rujukan pembayaran rahasia.</p>
      <p className="mt-4 flex flex-wrap gap-3">
        <Button type="button" onClick={() => { setFilter("all"); load("all"); }}>Semua</Button>
        <Button type="button" onClick={() => { setFilter("unread"); load("unread"); }}>Belum dibaca</Button>
        <Button type="button" onClick={markAll}>Tandai semua dibaca</Button>
      </p>
      {loading ? <div className="mt-6"><LoadingState /></div> : null}
      {error ? <div className="mt-6"><Alert tone="error" title={error} /></div> : null}
      <p className="mt-4 text-sm text-ink/55" aria-live="polite">{unread} belum dibaca</p>
      <ul className="mt-6 grid gap-3">
        {items.map((item) => (
          <li key={item.id} className={`rounded-2xl border p-4 ${item.readAt ? "border-stone-200 bg-white" : "border-gold-400/40 bg-stone-50"}`}>
            <p className="font-semibold text-ink">{item.title}</p>
            <p className="mt-1 text-sm text-ink/70">{item.body}</p>
            <p className="mt-2 text-xs text-ink/45">{formatDateTime(item.createdAt)} {item.readAt ? "· sudah dibaca" : "· belum dibaca"}</p>
            <p className="mt-3 flex gap-3 text-sm">
              {item.actionPath ? <Link className="text-gold-700 underline" href={item.actionPath}>Buka</Link> : null}
              {!item.readAt ? (
                <button type="button" className="text-gold-700 underline" onClick={() => mark(item.id)}>Tandai dibaca</button>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
      {!loading && items.length === 0 ? <p className="mt-6 text-ink/65">Tidak ada notifikasi.</p> : null}
    </div>
  );
}
