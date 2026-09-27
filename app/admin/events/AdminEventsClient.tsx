"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Container } from "@/components/ui/Container";
import { LoadingState } from "@/components/ui/LoadingState";
import { ReviewStatusBadge } from "@/components/admin/AdminReview";
import { STATUS_LABEL, type EventStatus } from "@/components/events/event-types";
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

  const currentStatus = filters.status || "PENDING_REVIEW";

  return (
    <Container>
      <p className="text-sm text-ink/60">Tinjau event sebelum terbit di katalog publik.</p>
      <form
        className="mt-5 flex min-w-0 flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const params = new URLSearchParams();
          const status = String(data.get("status") || currentStatus);
          const q = String(data.get("q") || "").trim();
          if (status) params.set("status", status);
          if (q.length >= 2) params.set("q", q);
          router.push(`/admin/events?${params}`);
        }}
      >
        <input type="hidden" name="status" value={currentStatus} />
        <label className="sr-only" htmlFor="q">
          Cari judul
        </label>
        <input
          id="q"
          name="q"
          defaultValue={filters.q || ""}
          placeholder="Cari judul event (min. 2 huruf)"
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 text-sm"
        />
        <button type="submit" className="min-h-11 rounded-full bg-gold-500 px-4 text-sm font-semibold text-white">
          Cari
        </button>
      </form>
      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter status">
        {[
          { id: "PENDING_REVIEW", label: "Menunggu" },
          { id: "PUBLISHED", label: "Terbit" },
          { id: "REJECTED", label: "Ditolak" },
          { id: "CANCELLED", label: "Dibatalkan" },
        ].map((item) => {
          const active = currentStatus === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                const params = new URLSearchParams();
                params.set("status", item.id);
                const q = (filters.q || "").trim();
                if (q.length >= 2) params.set("q", q);
                router.push(`/admin/events?${params}`);
              }}
              className={`min-h-11 rounded-full px-4 text-sm font-medium ${
                active ? "bg-ink text-white" : "border border-stone-200 bg-white text-ink/70 hover:bg-stone-50"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {forbidden ? (
        <div className="mt-6">
          <Alert tone="error" title="Akses ditolak">
            Hanya admin yang dapat memoderasi event.
          </Alert>
        </div>
      ) : null}
      {error ? (
        <div className="mt-6">
          <Alert tone="error" title="Gagal memuat">
            {error}
          </Alert>
        </div>
      ) : null}
      <div className="mt-6">
        {forbidden || error ? null : rows === null ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-5 py-10 text-center">
            <p className="font-medium text-ink">Tidak ada event pada filter ini</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <caption className="sr-only">Antrean moderasi event</caption>
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50/80 text-xs uppercase tracking-wide text-ink/45">
                  <th className="px-4 py-3 font-semibold" scope="col">
                    Judul
                  </th>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    Status
                  </th>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    Organizer
                  </th>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    Diajukan
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50/70">
                    <td className="px-4 py-3">
                      <Link className="font-medium text-ink underline-offset-2 hover:underline" href={`/admin/events/${row.id}`}>
                        {row.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <ReviewStatusBadge
                        status={row.status}
                        label={STATUS_LABEL[row.status as EventStatus] || row.status}
                      />
                    </td>
                    <td className="px-4 py-3 text-ink/70">{row.organizerName || "—"}</td>
                    <td className="px-4 py-3 text-ink/70">
                      {row.submittedAt ? <time dateTime={row.submittedAt}>{formatDateTime(row.submittedAt)}</time> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {nextCursor ? (
        <p className="mt-4">
          <Link
            className="text-gold-700 underline-offset-2 hover:underline"
            href={`/admin/events?${new URLSearchParams({ ...filters, cursor: nextCursor }).toString()}`}
          >
            Halaman berikutnya
          </Link>
        </p>
      ) : null}
    </Container>
  );
}
