"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Container } from "@/components/ui/Container";
import { LoadingState } from "@/components/ui/LoadingState";
import { AuditLogDetail } from "@/components/audit/AuditLogDetail";
import { readApiError } from "@/lib/api";

type Detail = {
  id: string;
  occurredAt: string;
  actorType: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  outcome: "SUCCESS" | "REJECTED" | "FAILED";
  reasonCode?: string | null;
  correlationId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

export default function AdminAuditDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/audit-logs/${params.id}`, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace(`/login?callbackUrl=/admin/audit/${params.id}`);
          return;
        }
        if (res.status === 403) {
          setForbidden(true);
          return;
        }
        if (!res.ok) {
          setError(readApiError(body, "Catatan audit tidak ditemukan."));
          return;
        }
        setDetail(body.data as Detail);
      })
      .catch(() => setError("Tidak dapat terhubung ke layanan audit."));
  }, [params.id, router]);

  return (
    <div>
      <Container>
        <h1 className="font-display text-3xl text-ink">Detail jejak audit</h1>
        {forbidden ? (
          <div className="mt-6">
            <Alert tone="error" title="Akses ditolak">
              Anda tidak memiliki izin untuk melihat jejak audit.
            </Alert>
          </div>
        ) : null}
        {error ? (
          <div className="mt-6">
            <Alert tone="error" title="Tidak dapat menampilkan">
              {error}
            </Alert>
          </div>
        ) : null}
        {!forbidden && !error && !detail ? (
          <div className="mt-6">
            <LoadingState label="Memuat detail…" />
          </div>
        ) : null}
        {detail ? (
          <div className="mt-6">
            <AuditLogDetail detail={detail} />
          </div>
        ) : null}
      </Container>
    </div>
  );
}
