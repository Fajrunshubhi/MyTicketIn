"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type AccountProfile, roleLabel } from "@/lib/account";
import { formatDateTime } from "@/lib/format";

type EventRow = { id: string; title: string; organizerName?: string; status: string; submittedAt?: string };
type OrgRow = { id: string; name: string; status: string; submittedAt?: string };
type LifeRow = { id: string; kind?: string; status: string; reason?: string };
type OpRow = { entityType: string; entityId: string; reasonCode: string; safeSummary: string };

export function AdminWorkspace() {
  const router = useRouter();
  const [me, setMe] = useState<AccountProfile | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [life, setLife] = useState<LifeRow[]>([]);
  const [ops, setOps] = useState<OpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const meRes = await fetch("/api/me", { credentials: "include", cache: "no-store" });
        if (meRes.status === 401) {
          router.replace("/login?callbackUrl=/dashboard&portal=admin");
          return;
        }
        const meBody = await meRes.json().catch(() => ({}));
        if (!cancelled) setMe((meBody.data || null) as AccountProfile | null);
        const [evRes, orgRes, lifeRes, opRes] = await Promise.all([
          fetch("/api/admin/events?status=PENDING_REVIEW&limit=8", { credentials: "include", cache: "no-store" }),
          fetch("/api/admin/organizer-applications?status=PENDING", { credentials: "include", cache: "no-store" }),
          fetch("/api/admin/lifecycle-requests", { credentials: "include", cache: "no-store" }),
          fetch("/api/admin/operations?queue=moderation", { credentials: "include", cache: "no-store" }),
        ]);
        if (evRes.status === 401 || orgRes.status === 401) {
          router.replace("/login?callbackUrl=/dashboard&portal=admin");
          return;
        }
        if (evRes.status === 403) {
          setError("Dashboard admin hanya untuk akun admin.");
          setLoading(false);
          return;
        }
        const evBody = await evRes.json().catch(() => ({}));
        const orgBody = await orgRes.json().catch(() => ({}));
        const lifeBody = await lifeRes.json().catch(() => ({}));
        const opBody = await opRes.json().catch(() => ({}));
        if (cancelled) return;
        setEvents((evBody.data?.items || []) as EventRow[]);
        const orgData = orgBody.data;
        setOrgs((Array.isArray(orgData) ? orgData : orgData?.items || []) as OrgRow[]);
        setLife((lifeBody.data?.items || lifeBody.data || []) as LifeRow[]);
        setOps((opBody.data?.items || []) as OpRow[]);
      } catch {
        if (!cancelled) setError("Tidak dapat terhubung ke layanan.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const pendingLife = life.filter((r) => r.status === "PENDING");

  return (
    <div>
      <p className="text-sm text-gold-800">SANDBOX / OPERASI UJI · {me ? roleLabel(me) : "Admin aplikasi"}</p>
      <p className="mt-1 text-lg font-semibold text-ink">Halo, {me?.name || me?.username || "admin"}</p>
      {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
      {loading ? <p role="status" className="mt-4 text-ink/60">Memuat dashboard admin…</p> : null}

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <li className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/45">Event menunggu</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{events.length}</p>
        </li>
        <li className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/45">Organizer menunggu</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{orgs.filter((o) => o.status === "PENDING" || !o.status).length}</p>
        </li>
        <li className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/45">Lifecycle pending</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{pendingLife.length}</p>
        </li>
        <li className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/45">Antrean moderasi</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{ops.length}</p>
        </li>
      </ul>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Event menunggu keputusan</h2>
            <Link href="/admin/events" className="text-sm text-gold-700">Semua</Link>
          </div>
          {events.length === 0 ? (
            <p className="mt-4 text-sm text-ink/55">Tidak ada event PENDING_REVIEW.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {events.slice(0, 6).map((e) => (
                <li key={e.id} className="rounded-2xl border border-stone-100 p-3">
                  <Link href={`/admin/events/${e.id}`} className="font-semibold text-gold-700">
                    {e.title}
                  </Link>
                  <p className="text-xs text-ink/55">
                    {e.organizerName || "Organizer"} · {e.submittedAt ? formatDateTime(e.submittedAt) : e.status}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Pengajuan organizer</h2>
            <Link href="/admin/organizers" className="text-sm text-gold-700">Semua</Link>
          </div>
          {orgs.length === 0 ? (
            <p className="mt-4 text-sm text-ink/55">Tidak ada pengajuan pending.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {orgs.slice(0, 6).map((o) => (
                <li key={o.id} className="rounded-2xl border border-stone-100 p-3">
                  <Link href={`/admin/organizers/${o.id}`} className="font-semibold text-gold-700">
                    {o.name}
                  </Link>
                  <p className="text-xs text-ink/55">{o.status}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Pengajuan batalkan / hentikan penjualan</h2>
          <Link href="/admin/operations" className="text-sm text-gold-700">Operasi</Link>
        </div>
        {pendingLife.length === 0 ? (
          <p className="mt-4 text-sm text-ink/55">Tidak ada pengajuan lifecycle menunggu konfirmasi.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {pendingLife.slice(0, 8).map((r) => (
              <li key={r.id} className="text-sm text-ink/80">
                {r.kind} · {r.reason || r.status}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
