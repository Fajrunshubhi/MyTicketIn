"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Container } from "@/components/ui/Container";
import { LoadingState } from "@/components/ui/LoadingState";
import { formatDateTime } from "@/lib/format";
import { readApiError } from "@/lib/api";

type Row = {
  id: string;
  title: string;
  organizerName: string;
  submittedAt: string;
  version: number;
  status: string;
};

export default function AdminEventsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [nextCursor, setNextCursor] = useState("");
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);

  const filters = useMemo(() => {
    const out: Record<string, string> = {};
    searchParams.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    const qs = query ? `?${query}` : "?status=PENDING_REVIEW";
    fetch(`/api/admin/events${qs}`, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace("/login?callbackUrl=/admin/events");
          return;
        }
        if (res.status === 403) {
          if (!cancelled) setForbidden(true);
          return;
        }
        if (!res.ok) {
          if (!cancelled) setError(readApiError(body, "Gagal memuat antrean."));
          return;
        }
        if (!cancelled) {
          setRows((body.data?.items || []) as Row[]);
          setNextCursor(String(body.data?.nextCursor || ""));
        }
      })
      .catch(() => {
        if (!cancelled) setError("Tidak dapat terhubung ke layanan.");
      });
    return () => {
      cancelled = true;
    };
  }, [query, router]);

  return (
    <div>
      <Container>
        <h1 className="font-display text-3xl text-ink">Moderasi event</h1>
        <form
          className="mt-6 flex min-w-0 flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const params = new URLSearchParams();
            const status = String(data.get("status") || "PENDING_REVIEW");
            const q = String(data.get("q") || "").trim();
            if (status) params.set("status", status);
            if (q.length >= 2) params.set("q", q);
            router.push(`/admin/events?${params}`);
          }}
        >
          <label className="sr-only" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={filters.status || "PENDING_REVIEW"} className="min-h-11 rounded-md border border-stone-300 bg-white px-3 text-sm">
            <option value="PENDING_REVIEW">Pending</option>
            <option value="PUBLISHED">Terbit</option>
            <option value="REJECTED">Ditolak</option>
            <option value="CANCELLED">Dibatalkan</option>
          </select>
          <input id="q" name="q" defaultValue={filters.q || ""} placeholder="Cari judul" className="min-h-11 min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 text-sm" />
          <button type="submit" className="min-h-11 rounded-md bg-gold-500 px-4 text-sm font-semibold text-ink">Filter</button>
        </form>
        {forbidden ? <div className="mt-6"><Alert tone="error" title="Akses ditolak">Hanya admin yang dapat memoderasi event.</Alert></div> : null}
        {error ? <div className="mt-6"><Alert tone="error" title="Gagal memuat">{error}</Alert></div> : null}
        <div className="mt-6 overflow-x-auto">
          {forbidden || error ? null : rows === null ? <LoadingState /> : rows.length === 0 ? <p>Tidak ada event.</p> : (
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <caption className="sr-only">Antrean moderasi event</caption>
              <thead>
                <tr className="border-b border-stone-200">
                  <th className="py-2 pr-3" scope="col">Judul</th>
                  <th className="py-2 pr-3" scope="col">Organizer</th>
                  <th className="py-2" scope="col">Diajukan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-stone-200">
                    <td className="py-3 pr-3">
                      <Link className="underline-offset-2 hover:underline" href={`/admin/events/${row.id}`}>{row.title}</Link>
                    </td>
                    <td className="py-3 pr-3">{row.organizerName || "—"}</td>
                    <td className="py-3">{row.submittedAt ? <time dateTime={row.submittedAt}>{formatDateTime(row.submittedAt)}</time> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {nextCursor ? (
          <p className="mt-4">
            <Link className="text-gold-700 underline-offset-2 hover:underline" href={`/admin/events?${new URLSearchParams({ ...filters, cursor: nextCursor }).toString()}`}>Halaman berikutnya</Link>
          </p>
        ) : null}
      </Container>
    </div>
  );
}
