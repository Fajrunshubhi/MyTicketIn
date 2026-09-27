"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Container } from "@/components/ui/Container";
import { LoadingState } from "@/components/ui/LoadingState";
import { ORGANIZER_STATUS_LABEL, ReviewStatusBadge } from "@/components/admin/AdminReview";
import { formatDateTime } from "@/lib/format";
import { readApiError } from "@/lib/api";

type Row = {
  id: string;
  name: string;
  status: string;
  submittedAt: string;
  contact: string;
  hasAppeal?: boolean;
};

const FILTERS = [
  { id: "", label: "Semua" },
  { id: "PENDING", label: "Menunggu" },
  { id: "APPROVED", label: "Disetujui" },
  { id: "REJECTED", label: "Ditolak" },
  { id: "SUSPENDED", label: "Ditangguhkan" },
];

export default function AdminOrganizersClient() {
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
    fetch(`/api/admin/organizer-applications${query ? `?${query}` : ""}`, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace("/login?callbackUrl=/admin/organizers");
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
          setRows((body.data as Row[]) || []);
          setNextCursor(String(body.page?.nextCursor || ""));
        }
      })
      .catch(() => {
        if (!cancelled) setError("Tidak dapat terhubung ke layanan.");
      });
    return () => {
      cancelled = true;
    };
  }, [query, router]);

  function setStatus(status: string) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const q = (filters.q || "").trim();
    if (q.length >= 2) params.set("q", q);
    router.push(params.toString() ? `/admin/organizers?${params}` : "/admin/organizers");
  }

  return (
    <Container>
      <p className="text-sm text-ink/60">Tinjau pengajuan sebelum pelamar mendapat akses menulis event.</p>

      <form
        className="mt-5 flex min-w-0 flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const params = new URLSearchParams();
          const status = String(data.get("status") || filters.status || "");
          const q = String(data.get("q") || "").trim();
          if (status) params.set("status", status);
          if (q.length >= 2) params.set("q", q);
          router.push(params.toString() ? `/admin/organizers?${params}` : "/admin/organizers");
        }}
      >
        <input type="hidden" name="status" value={filters.status || ""} />
        <label className="sr-only" htmlFor="q">
          Cari nama
        </label>
        <input
          id="q"
          name="q"
          defaultValue={filters.q || ""}
          placeholder="Cari nama organisasi (min. 2 huruf)"
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 text-sm"
        />
        <button type="submit" className="min-h-11 rounded-full bg-gold-500 px-4 text-sm font-semibold text-white">
          Cari
        </button>
      </form>

      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter status">
        {FILTERS.map((item) => {
          const active = (filters.status || "") === item.id;
          return (
            <button
              key={item.id || "all"}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setStatus(item.id)}
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
            Hanya admin yang dapat memoderasi organizer.
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

      <div className="mt-6" aria-live="polite">
        {forbidden || error ? null : rows === null ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-5 py-10 text-center">
            <p className="font-medium text-ink">Tidak ada pengajuan pada filter ini</p>
            <p className="mt-1 text-sm text-ink/55">Ubah status atau kata kunci pencarian.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <caption className="sr-only">Antrean pengajuan organizer</caption>
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50/80 text-xs uppercase tracking-wide text-ink/45">
                  <th className="px-4 py-3 font-semibold" scope="col">
                    Organisasi
                  </th>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    Status
                  </th>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    Diajukan
                  </th>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    Kontak
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50/70">
                    <td className="px-4 py-3">
                      <Link className="font-medium text-ink underline-offset-2 hover:underline" href={`/admin/organizers/${row.id}`}>
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <ReviewStatusBadge status={row.status} label={ORGANIZER_STATUS_LABEL[row.status] || row.status} />
                        {row.hasAppeal ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-inset ring-amber-200">
                            Sanggahan
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink/70">
                      <time dateTime={row.submittedAt}>{formatDateTime(row.submittedAt)}</time>
                    </td>
                    <td className="px-4 py-3 text-ink/70">{row.contact}</td>
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
            href={`/admin/organizers?${new URLSearchParams({ ...filters, cursor: nextCursor }).toString()}`}
          >
            Halaman berikutnya
          </Link>
        </p>
      ) : null}
    </Container>
  );
}
