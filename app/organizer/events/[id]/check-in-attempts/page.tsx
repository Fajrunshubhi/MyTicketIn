"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { AppHeader } from "@/components/shared/AppHeader";
import { Alert } from "@/components/ui/Alert";
import { Container } from "@/components/ui/Container";
import { apiFetch, readApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { TicketHolderBiodata, type TicketHolder } from "@/components/checkin/TicketHolderBiodata";

type Row = {
  id: string;
  result: string;
  reasonCode: string;
  attemptedAt: string;
  firstUsedAt?: string;
  ticketNumberMasked?: string;
  operatorName: string;
  inputType?: string;
  holder?: TicketHolder | null;
};

const RESULT_LABEL: Record<string, string> = {
  VALID: "Check-in berhasil",
  ALREADY_USED: "Tiket sudah digunakan",
  INVALID: "Tidak valid",
  CANCELLED: "Tiket dibatalkan",
  WRONG_EVENT: "Event salah",
};

function formatWhen(iso?: string) {
  if (!iso) return "";
  try {
    return formatDateTime(iso);
  } catch {
    return iso;
  }
}

export default function CheckInAttemptsPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const embedded = pathname.startsWith("/dashboard");
  const eventHref = `/dashboard/event/${params.id}`;
  const [items, setItems] = useState<Row[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/api/events/${params.id}/check-in-attempts`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(readApiError(body, "Riwayat tidak dapat dimuat."));
          return;
        }
        setItems((body.data as { items?: Row[] })?.items || []);
      })
      .catch(() => setError("Tidak dapat terhubung ke layanan."));
  }, [params.id]);

  const checkedIn = items.filter((it) => it.result === "VALID").length;

  const inner = (
    <>
      <h1 className="font-display text-3xl text-ink">Riwayat check-in</h1>
      <p className="mt-2 text-sm text-ink/65">
        {checkedIn} tiket berhasil check-in dari {items.length} percobaan.
      </p>
      {error ? (
        <div className="mt-4">
          <Alert tone="error" title={error} />
        </div>
      ) : null}
      {items.length === 0 && !error ? <p className="mt-4 text-ink/65">Belum ada percobaan.</p> : null}
      <ul className="mt-6 space-y-3">
        {items.map((it) => (
          <li
            key={it.id}
            className={`rounded-xl border bg-white p-4 ${
              it.result === "VALID"
                ? "border-emerald-200"
                : it.result === "ALREADY_USED"
                  ? "border-amber-200"
                  : "border-stone-200"
            }`}
          >
            <p className="font-semibold text-ink">{RESULT_LABEL[it.result] || it.result}</p>
            <p className="mt-1 text-sm text-ink/70">
              {it.ticketNumberMasked ? `Nomor tiket ${it.ticketNumberMasked}` : "Tiket tidak dikenali"}
              {" · "}
              {it.operatorName}
              {" · "}
              {formatWhen(it.attemptedAt) || "Waktu tidak tercatat"}
            </p>
            <p className="mt-1 text-xs text-ink/50">
              {it.inputType === "MANUAL_CODE" ? "Kode cadangan" : it.inputType === "QR_TOKEN" ? "Pindai QR" : "Percobaan scan"}
            </p>
            {it.holder ? <TicketHolderBiodata holder={it.holder} /> : null}
          </li>
        ))}
      </ul>
    </>
  );

  if (embedded) {
    return <div>{inner}</div>;
  }

  return (
    <main id="konten-utama" className="auth-shell min-h-screen">
      <AppHeader homeHref="/dashboard" items={[{ href: `${eventHref}/scanner`, label: "Scanner" }]} showLogout />
      <Container>{inner}</Container>
    </main>
  );
}
