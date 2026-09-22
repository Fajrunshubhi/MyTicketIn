"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Container } from "@/components/ui/Container";
import { LoadingState } from "@/components/ui/LoadingState";
import { AuditLogList, type AuditSummary } from "@/components/audit/AuditLogList";
import { readApiError } from "@/lib/api";

export default function AdminAuditClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<AuditSummary[] | null>(null);
  const [nextCursor, setNextCursor] = useState("");
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);

  const query = searchParams.toString();
  const filters = useMemo(() => {
    const out: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError("");
    setForbidden(false);
    fetch(`/api/admin/audit-logs${query ? `?${query}` : ""}`, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace("/login?callbackUrl=/admin/audit");
          return;
        }
        if (res.status === 403) {
          if (!cancelled) setForbidden(true);
          return;
        }
        if (!res.ok) {
          if (!cancelled) setError(readApiError(body, "Gagal memuat jejak audit."));
          return;
        }
        if (!cancelled) {
          setRows((body.data as AuditSummary[]) || []);
          setNextCursor(String(body.page?.nextCursor || ""));
        }
      })
      .catch(() => {
        if (!cancelled) setError("Tidak dapat terhubung ke layanan audit.");
      });
    return () => {
      cancelled = true;
    };
  }, [query, router]);

  return (
    <div>
      <Container>
        <p className="mt-2 max-w-2xl text-ink/65">
          Catatan append-only. Tidak ada edit atau hapus dari aplikasi.
        </p>
        {forbidden ? (
          <div className="mt-6">
            <Alert tone="error" title="Akses ditolak">
              Anda tidak memiliki izin untuk melihat jejak audit.
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
          {forbidden ? null : rows === null && !error ? (
            <LoadingState label="Memuat jejak audit…" />
          ) : rows && rows.length === 0 ? (
            <p>Belum ada catatan audit untuk filter ini.</p>
          ) : rows ? (
            <AuditLogList rows={rows} nextCursor={nextCursor} filters={filters} />
          ) : null}
        </div>
      </Container>
    </div>
  );
}
