"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { formatCheckInBefore, formatDateTime } from "@/lib/format";
import { downloadTicketPdf } from "@/lib/ticket-pdf";

type Ticket = {
  id: string;
  ticketNumber: string;
  manualCode: string;
  status: string;
  issuedAt: string;
  usedAt?: string;
  event?: {
    slug?: string;
    title?: string;
    startsAt?: string;
    endsAt?: string;
    timezone?: string;
    venueName?: string;
    addressLine?: string;
    city?: string;
    province?: string;
  };
  ticketType?: { name?: string; sectionName?: string; seatLabel?: string };
  order?: { orderNumber?: string };
  owner?: { name?: string };
  holder?: { fullName?: string; email?: string; phone?: string; identityNumber?: string };
};

const STATUS_LABEL: Record<string, string> = {
  UNUSED: "Belum digunakan",
  USED: "Sudah digunakan",
  CANCELLED: "Dibatalkan",
};

function safeTime(iso?: string, tz?: string) {
  if (!iso) return "—";
  try {
    return formatDateTime(iso, tz || "Asia/Jakarta");
  } catch {
    return iso;
  }
}

function safeCheckInBefore(iso?: string, tz?: string) {
  if (!iso) return "";
  try {
    return formatCheckInBefore(iso, tz || "Asia/Jakarta");
  } catch {
    return "";
  }
}

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState("");
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrBlob, setQrBlob] = useState<Blob | null>(null);
  const [qrError, setQrError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const qrUrlRef = useRef<string | null>(null);

  const revokeQr = useCallback(() => {
    if (qrUrlRef.current) URL.revokeObjectURL(qrUrlRef.current);
    qrUrlRef.current = null;
    setQrUrl(null);
    setQrBlob(null);
  }, []);

  const loadQr = useCallback(async (): Promise<Blob | null> => {
    setQrError("");
    const res = await fetch(`/api/tickets/${params.id}/qr`, { credentials: "include", cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setQrError((body as { error?: { message?: string } }).error?.message || "Kode QR tidak tersedia.");
      return null;
    }
    const blob = await res.blob();
    if (qrUrlRef.current) URL.revokeObjectURL(qrUrlRef.current);
    const url = URL.createObjectURL(blob);
    qrUrlRef.current = url;
    setQrBlob(blob);
    setQrUrl(url);
    return blob;
  }, [params.id]);

  const load = useCallback(() => {
    fetch(`/api/tickets/${params.id}`, { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) {
          setError(body.error?.message || "Tiket tidak ditemukan.");
          setTicket(null);
          return;
        }
        setError("");
        setTicket((body.data as { ticket?: Ticket })?.ticket || null);
      })
      .catch(() => setError("Tiket gagal dimuat."));
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (ticket?.status === "UNUSED" && !qrUrlRef.current) {
      void loadQr();
    }
  }, [ticket?.id, ticket?.status, loadQr]);

  useEffect(() => {
    function onVis() {
      if (document.visibilityState !== "visible") revokeQr();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [revokeQr]);

  useEffect(() => {
    return () => {
      if (qrUrlRef.current) URL.revokeObjectURL(qrUrlRef.current);
    };
  }, []);

  async function copyCode() {
    if (!ticket?.manualCode) return;
    await navigator.clipboard.writeText(ticket.manualCode.replace(/\s/g, ""));
    setCopied(true);
  }

  async function savePdf() {
    if (!ticket) return;
    setPdfBusy(true);
    try {
      let blob = qrBlob;
      if (ticket.status === "UNUSED" && !blob) blob = await loadQr();
      const tz = ticket.event?.timezone || "Asia/Jakarta";
      await downloadTicketPdf({
        fileName: `tiket-${ticket.ticketNumber}.pdf`,
        qrBlob: blob,
        lines: [
          "MyTicketIn — E-tiket",
          ticket.event?.title || "Event",
          `${ticket.event?.venueName || ""}, ${ticket.event?.city || ""} ${ticket.event?.province || ""}`.trim(),
          `Waktu: ${safeTime(ticket.event?.startsAt, tz)}`,
          safeCheckInBefore(ticket.event?.startsAt, tz),
          `Jenis: ${ticket.ticketType?.name || "-"}`,
          ticket.ticketType?.seatLabel ? `Kursi: ${ticket.ticketType.seatLabel}` : "",
          `Nomor tiket: ${ticket.ticketNumber}`,
          `Order: ${ticket.order?.orderNumber || "-"}`,
          `Status: ${STATUS_LABEL[ticket.status] || ticket.status}`,
          "Pemegang tiket",
          `Nama: ${ticket.holder?.fullName || ticket.owner?.name || "-"}`,
          `Email: ${ticket.holder?.email || "-"}`,
          `HP: ${ticket.holder?.phone || "-"}`,
          `NIK: ${ticket.holder?.identityNumber || "-"}`,
          `Kode cadangan: ${ticket.manualCode}`,
          "QR hanya untuk check-in. Jangan bagikan berkas ini.",
        ].filter(Boolean),
      });
    } catch {
      setQrError("PDF tiket gagal dibuat.");
    } finally {
      setPdfBusy(false);
    }
  }

  const holder = ticket?.holder;
  const hasHolder = Boolean(holder?.fullName || holder?.email || holder?.identityNumber);

  return (
    <div>
      <Container>
        {error ? <Alert tone="error" title={error} /> : null}
        {ticket ? (
          <article className="mx-auto max-w-lg rounded-2xl border border-stone-200 bg-white p-6">
            <p className="text-sm uppercase tracking-widest text-gold-700">{STATUS_LABEL[ticket.status] || ticket.status}</p>
            <h1 className="font-display mt-2 text-3xl text-ink">{ticket.event?.title || "Tiket"}</h1>
            <p className="mt-2 text-ink/70">
              {ticket.event?.venueName}
              {ticket.event?.city ? `, ${ticket.event.city}` : ""}
              {ticket.event?.province ? `, ${ticket.event.province}` : ""}
            </p>
            <p className="text-ink/70">{safeTime(ticket.event?.startsAt, ticket.event?.timezone)}</p>
            {safeCheckInBefore(ticket.event?.startsAt, ticket.event?.timezone) ? (
              <p className="mt-2 text-sm font-medium text-ink/80">
                {safeCheckInBefore(ticket.event?.startsAt, ticket.event?.timezone)}
              </p>
            ) : null}
            <p className="mt-4 text-ink/85">
              {ticket.ticketType?.name}
              {ticket.ticketType?.sectionName ? ` · ${ticket.ticketType.sectionName}` : ""}
              {ticket.ticketType?.seatLabel ? ` · kursi ${ticket.ticketType.seatLabel}` : ""}
            </p>
            <dl className="mt-4 space-y-1 text-sm text-ink/85">
              <div>Nomor tiket {ticket.ticketNumber}</div>
              <div>Order {ticket.order?.orderNumber || "—"}</div>
              <div>Akun pembeli {ticket.owner?.name || "—"}</div>
            </dl>
            <section className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
              <h2 className="font-display text-lg text-ink">Biodata pemegang tiket</h2>
              {hasHolder ? (
                <dl className="mt-2 space-y-1 text-sm text-ink/85">
                  <div>Nama {holder?.fullName || "—"}</div>
                  <div>Email {holder?.email || "—"}</div>
                  <div>Nomor HP {holder?.phone || "—"}</div>
                  <div>NIK {holder?.identityNumber || "—"}</div>
                </dl>
              ) : (
                <p className="mt-2 text-sm text-ink/65">Biodata pemegang tidak tercatat pada tiket ini.</p>
              )}
            </section>
            <p className="mt-4">
              Kode cadangan{" "}
              <span className="font-mono tracking-widest">{ticket.manualCode}</span>{" "}
              <Button className="ml-2" onClick={copyCode} aria-label="Salin kode cadangan">
                {copied ? "Tersalin" : "Salin"}
              </Button>
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {ticket.status === "UNUSED" ? (
                <Button onClick={() => void loadQr()}>Tampilkan QR</Button>
              ) : null}
              <Button onClick={() => void savePdf()} disabled={pdfBusy}>
                {pdfBusy ? "Menyiapkan PDF…" : "Unduh PDF"}
              </Button>
            </div>
            {qrError ? (
              <div className="mt-3">
                <Alert tone="error" title={qrError} />
              </div>
            ) : null}
            {ticket.status === "UNUSED" && qrUrl ? (
              <figure className="mt-4 rounded-xl bg-white p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrUrl} width={320} height={320} alt={`Kode QR tiket ${ticket.ticketNumber}`} className="mx-auto h-auto w-full max-w-xs" />
                <figcaption className="mt-2 text-center text-sm text-ink">
                  {safeCheckInBefore(ticket.event?.startsAt, ticket.event?.timezone)}
                  {safeCheckInBefore(ticket.event?.startsAt, ticket.event?.timezone) ? " " : ""}
                  QR hanya berisi token check-in.
                </figcaption>
              </figure>
            ) : null}
            {ticket.status !== "UNUSED" ? (
              <p className="mt-6 text-ink/70">
                Tiket {STATUS_LABEL[ticket.status] || ticket.status}. Kode QR tidak ditampilkan.
              </p>
            ) : (
              <p className="mt-3 text-sm text-ink/60">QR hanya ditampilkan saat diminta dan tidak disimpan di perangkat.</p>
            )}
          </article>
        ) : null}
      </Container>
    </div>
  );
}
