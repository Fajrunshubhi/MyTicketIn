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
  name: string;
  status: string;
  submittedAt: string;
  contact: string;
};

const statusLabel: Record<string, string> = {
  PENDING: "… Pending",
  APPROVED: "✓ Disetujui",
  REJECTED: "✕ Ditolak",
  SUSPENDED: "! Ditangguhkan",
};

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

  return (
    <div>
      <Container>
        <h1 className="font-display text-3xl text-ink">Moderasi organizer</h1>
        <form
          className="mt-6 flex min-w-0 flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const params = new URLSearchParams();
            const status = String(data.get("status") || "");
            const q = String(data.get("q") || "").trim();
            if (status) params.set("status", status);
            if (q.length >= 2) params.set("q", q);
            router.push(params.toString() ? `/admin/organizers?${params}` : "/admin/organizers");
          }}
        >
          <label className="sr-only" htmlFor="status">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={filters.status || ""}
            className="min-h-11 rounded-md border border-stone-300 bg-white px-3 text-sm"
          >
            <option value="">Semua status</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Disetujui</option>
            <option value="REJECTED">Ditolak</option>
            <option value="SUSPENDED">Ditangguhkan</option>
          </select>
          <label className="sr-only" htmlFor="q">
            Cari nama
          </label>
          <input
            id="q"
            name="q"
            defaultValue={filters.q || ""}
            placeholder="Cari nama (min. 2 huruf)"
            className="min-h-11 min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 text-sm"
          />
          <button type="submit" className="min-h-11 rounded-md bg-gold-500 px-4 text-sm font-semibold text-ink">
            Filter
          </button>
        </form>
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
        <div className="mt-6 overflow-x-auto" aria-live="polite">
          {forbidden || error ? null : rows === null ? (
            <LoadingState />
          ) : rows.length === 0 ? (
            <p>Tidak ada pengajuan.</p>
          ) : (
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <caption className="sr-only">Antrean pengajuan organizer</caption>
              <thead>
                <tr className="border-b border-stone-200">
                  <th className="py-2 pr-3" scope="col">
                    Nama
                  </th>
                  <th className="py-2 pr-3" scope="col">
                    Status
                  </th>
                  <th className="py-2 pr-3" scope="col">
                    Diajukan
                  </th>
                  <th className="py-2" scope="col">
                    Kontak
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-stone-200">
                    <td className="py-3 pr-3">
                      <Link className="underline-offset-2 hover:underline" href={`/admin/organizers/${row.id}`}>
                        {row.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-3">{statusLabel[row.status] || row.status}</td>
                    <td className="py-3 pr-3">
                      <time dateTime={row.submittedAt}>{formatDateTime(row.submittedAt)}</time>
                    </td>
                    <td className="py-3">{row.contact}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    </div>
  );
}
