"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

type Ticket = {
  id: string;
  ticketNumber: string;
  manualCode: string;
  status: string;
  issuedAt: string;
  usedAt?: string;
  cancelledAt?: string;
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

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState("");
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState("");
  const [copied, setCopied] = useState(false);

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
    return () => {
      if (qrUrl) URL.revokeObjectURL(qrUrl);
    };
  }, [qrUrl]);

  useEffect(() => {
    function onVis() {
      if (document.visibilityState !== "visible" && qrUrl) {
        URL.revokeObjectURL(qrUrl);
        setQrUrl(null);
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [qrUrl]);

  async function showQr() {
    setQrError("");
    const res = await fetch(`/api/tickets/${params.id}/qr`, { credentials: "include", cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setQrError((body as { error?: { message?: string } }).error?.message || "Kode QR tidak tersedia.");
      return;
    }
    const blob = await res.blob();
    if (qrUrl) URL.revokeObjectURL(qrUrl);
    setQrUrl(URL.createObjectURL(blob));
  }

  async function copyCode() {
    if (!ticket?.manualCode) return;
    await navigator.clipboard.writeText(ticket.manualCode.replace(/\s/g, ""));
    setCopied(true);
  }

  return (
    <div>
      <Container>
        {error ? <Alert tone="error" title={error} /> : null}
        {ticket ? (
          <article>
            <p className="text-sm uppercase tracking-widest text-gold-700">{STATUS_LABEL[ticket.status] || ticket.status}</p>
            <h1 className="font-display mt-2 text-3xl text-ink">{ticket.event?.title}</h1>
            <p className="mt-2 text-ink/70">
              {ticket.event?.venueName}, {ticket.event?.city}
            </p>
            <p className="text-ink/70">
              {ticket.event?.startsAt} · {ticket.event?.timezone}
            </p>
            <p className="mt-4 text-ink/85">
              {ticket.ticketType?.name}
              {ticket.ticketType?.sectionName ? ` · ${ticket.ticketType.sectionName}` : ""}
              {ticket.ticketType?.seatLabel ? ` · kursi ${ticket.ticketType.seatLabel}` : ""}
            </p>
            <p className="mt-2">Nomor tiket {ticket.ticketNumber}</p>
            <p>Order {ticket.order?.orderNumber}</p>
            <p>Akun pembeli {ticket.owner?.name}</p>
            {ticket.holder?.fullName ? (
              <p>
                Pemegang tiket {ticket.holder.fullName}
                {ticket.holder.identityNumber ? ` · NIK ${ticket.holder.identityNumber}` : ""}
              </p>
            ) : null}
            <p className="mt-4">
              Kode cadangan{" "}
              <span className="font-mono tracking-widest">{ticket.manualCode}</span>{" "}
              <Button className="ml-2" onClick={copyCode} aria-label="Salin kode cadangan">
                {copied ? "Tersalin" : "Salin"}
              </Button>
            </p>
            {ticket.status === "UNUSED" ? (
              <div className="mt-6">
                <Button onClick={showQr}>Tampilkan QR</Button>
                {qrError ? <div className="mt-3"><Alert tone="error" title={qrError} /></div> : null}
                {qrUrl ? (
                  <figure className="mt-4 max-w-xs rounded-xl bg-white p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrUrl} width={320} height={320} alt={`Kode QR tiket ${ticket.ticketNumber}`} className="h-auto w-full" />
                    <figcaption className="mt-2 text-center text-sm text-ink">
                      Perbesar layar. Jangan bagikan atau unggah kode ini.
                    </figcaption>
                  </figure>
                ) : null}
                <p className="mt-3 text-sm text-ink/60">
                  QR hanya ditampilkan saat diminta dan tidak disimpan di perangkat.
                </p>
              </div>
            ) : (
              <p className="mt-6 text-ink/70">
                Tiket {STATUS_LABEL[ticket.status] || ticket.status}. Kode QR tidak ditampilkan.
                {ticket.status === "CANCELLED" ? " Kembali ke wallet untuk melihat tiket lain." : ""}
              </p>
            )}
          </article>
        ) : null}
      </Container>
    </div>
  );
}
