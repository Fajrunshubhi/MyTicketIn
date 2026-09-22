"use client";

import { useEffect, useState } from "react";
import { apiFetch, readApiError } from "@/lib/api";
import { FloatingAlert } from "@/components/ui/FloatingAlert";
import { Button } from "@/components/ui/Button";

type LifecycleRequest = {
  id: string;
  eventId: string;
  ticketTypeId?: string | null;
  kind: "CANCEL_EVENT" | "STOP_SALES";
  status: string;
  reason: string;
  eventTitle?: string;
  organizerName?: string;
  ticketTypeName?: string;
};

export function AdminLifecycleAlerts() {
  const [items, setItems] = useState<LifecycleRequest[]>([]);
  const [toast, setToast] = useState<{ tone: "success" | "error"; title: string; body: string } | null>(null);
  const [rejectId, setRejectId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState("");

  function load() {
    fetch("/api/admin/lifecycle-requests", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          setItems([]);
          return;
        }
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setToast({ tone: "error", title: "Gagal", body: readApiError(body, "Gagal memuat pengajuan.") });
          return;
        }
        setItems((body.data?.items || []) as LifecycleRequest[]);
      })
      .catch(() => setItems([]));
  }

  useEffect(() => {
    const state = { timer: 0, active: true };
    fetch("/api/me", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok || !state.active) return;
        const body = await res.json().catch(() => ({}));
        const admin = Boolean(body.data?.access?.isAdmin || body.data?.role === "ADMIN");
        if (!admin || !state.active) return;
        load();
        state.timer = window.setInterval(load, 12000);
      })
      .catch(() => undefined);
    return () => {
      state.active = false;
      if (state.timer) window.clearInterval(state.timer);
    };
  }, []);

  async function decide(id: string, decision: "APPROVE" | "REJECT") {
    setBusy(id);
    const res = await apiFetch(`/api/admin/lifecycle-requests/${id}/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason: decision === "REJECT" ? rejectReason : "" }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setToast({ tone: "error", title: "Gagal", body: readApiError(body, "Keputusan gagal.") });
      return;
    }
    setRejectId("");
    setRejectReason("");
    setToast({
      tone: "success",
      title: "Berhasil",
      body: decision === "APPROVE" ? "Pengajuan disetujui." : "Pengajuan ditolak.",
    });
    load();
  }

  if (items.length === 0 && !toast) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-3">
      {toast ? (
        <div className="pointer-events-auto">
          <FloatingAlert tone={toast.tone} title={toast.title} onClose={() => setToast(null)} anchored={false}>
            {toast.body}
          </FloatingAlert>
        </div>
      ) : null}
      {items.map((item) => (
        <div key={item.id} className="pointer-events-auto rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-lg">
          <p className="font-semibold text-ink">
            {item.kind === "CANCEL_EVENT" ? "Konfirmasi pembatalan event" : "Konfirmasi hentikan penjualan"}
          </p>
          <p className="mt-1 text-sm text-ink/80">
            {item.eventTitle || item.eventId}
            {item.ticketTypeName ? ` · ${item.ticketTypeName}` : ""}
          </p>
          {item.organizerName ? <p className="text-sm text-ink/65">{item.organizerName}</p> : null}
          <p className="mt-2 text-sm text-ink/80">{item.reason}</p>
          {rejectId === item.id ? (
            <div className="mt-3 grid gap-2">
              <label className="text-sm font-medium" htmlFor={`reject-${item.id}`}>Alasan tolak (min. 10 karakter)</label>
              <textarea
                id={`reject-${item.id}`}
                className="min-h-20 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={busy === item.id} onClick={() => void decide(item.id, "REJECT")}>Tolak</Button>
                <Button type="button" onClick={() => setRejectId("")}>Batal</Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" disabled={busy === item.id} onClick={() => void decide(item.id, "APPROVE")}>Setujui</Button>
              <Button type="button" onClick={() => { setRejectId(item.id); setRejectReason(""); }}>Tolak</Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
