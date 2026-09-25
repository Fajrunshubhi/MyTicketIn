"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EventCoverImg } from "@/components/events/EventCoverImg";
import { TicketHolderBiodata } from "@/components/checkin/TicketHolderBiodata";
import { Icon } from "@/components/ui/Icon";
import { formatCheckInBefore, formatDateTime } from "@/lib/format";
import { renderQrPngBlob } from "@/lib/qr-client";
import { downloadEventTicketPdf } from "@/lib/ticket-pdf";

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
    category?: string;
    startsAt?: string;
    endsAt?: string;
    timezone?: string;
    venueName?: string;
    addressLine?: string;
    city?: string;
    province?: string;
    imageUrl?: string;
  };
  ticketType?: { name?: string; sectionName?: string; seatLabel?: string };
  order?: { id?: string; orderNumber?: string };
  owner?: { name?: string };
  holder?: { fullName?: string; email?: string; phone?: string; identityNumber?: string };
};

const STATUS_LABEL: Record<string, string> = {
  UNUSED: "Siap dipakai",
  USED: "Sudah check-in",
  CANCELLED: "Dibatalkan",
};

function statusClass(status: string) {
  if (status === "UNUSED") return "bg-[#eee8ff] text-gold-800";
  if (status === "USED") return "bg-emerald-50 text-emerald-800";
  return "bg-stone-100 text-ink/60";
}

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
    const apply = (blob: Blob) => {
      if (qrUrlRef.current) URL.revokeObjectURL(qrUrlRef.current);
      const url = URL.createObjectURL(blob);
      qrUrlRef.current = url;
      setQrBlob(blob);
      setQrUrl(url);
    };
    try {
      const res = await fetch(`/api/tickets/${params.id}/qr`, { credentials: "include", cache: "no-store" });
      const type = res.headers.get("content-type") || "";
      if (res.ok && type.includes("image")) {
        const blob = await res.blob();
        if (blob.size > 32) {
          apply(blob);
          return blob;
        }
      }
    } catch {
      /* fall back to on-device QR from the printed backup code */
    }
    const payload = (ticket?.manualCode || "").replace(/[\s-]/g, "") || ticket?.ticketNumber || "";
    if (!payload) {
      setQrError("Kode QR tidak dapat ditampilkan.");
      return null;
    }
    try {
      const blob = await renderQrPngBlob(payload);
      apply(blob);
      return blob;
    } catch {
      setQrError("Kode QR tidak dapat ditampilkan.");
      return null;
    }
  }, [params.id, ticket?.manualCode, ticket?.ticketNumber]);

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
    if (ticket && ticket.status !== "CANCELLED" && !qrUrlRef.current) {
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
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function savePdf() {
    if (!ticket) return;
    setPdfBusy(true);
    try {
      let blob = qrBlob;
      if (ticket.status !== "CANCELLED" && !blob) blob = await loadQr();
      await downloadEventTicketPdf(
        {
          ticketNumber: ticket.ticketNumber,
          manualCode: ticket.manualCode,
          status: ticket.status,
          eventTitle: ticket.event?.title || "Event",
          venueLine: [ticket.event?.venueName, ticket.event?.city, ticket.event?.province].filter(Boolean).join(", "),
          startsAt: ticket.event?.startsAt,
          timezone: ticket.event?.timezone,
          ticketTypeName: ticket.ticketType?.name,
          sectionName: ticket.ticketType?.sectionName,
          seatLabel: ticket.ticketType?.seatLabel,
          orderNumber: ticket.order?.orderNumber,
          holderName: ticket.holder?.fullName || ticket.owner?.name,
          holderEmail: ticket.holder?.email,
          holderPhone: ticket.holder?.phone,
          holderNik: ticket.holder?.identityNumber,
        },
        blob,
      );
    } catch {
      setQrError("PDF tiket gagal dibuat.");
    } finally {
      setPdfBusy(false);
    }
  }

  const tz = ticket?.event?.timezone || "Asia/Jakarta";
  const when = ticket ? safeTime(ticket.event?.startsAt, tz) : "";
  const checkIn = ticket ? safeCheckInBefore(ticket.event?.startsAt, tz) : "";
  const place = ticket
    ? [ticket.event?.venueName, ticket.event?.city, ticket.event?.province].filter(Boolean).join(" · ")
    : "";
  const address = ticket?.event?.addressLine || "";

  return (
    <div>
      <Link
        href="/tickets"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-ink/70 hover:text-ink"
      >
        <Icon name="arrow" className="h-4 w-4 rotate-180" />
        Kembali ke wallet
      </Link>

      {error ? (
        <div className="mt-4">
          <Alert tone="error" title={error} />
        </div>
      ) : null}

      {!ticket && !error ? <p className="mt-8 text-sm text-ink/55">Memuat tiket…</p> : null}

      {ticket ? (
        <article className="mt-4 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
          <div className="relative">
            <EventCoverImg
              src={ticket.event?.imageUrl}
              alt={ticket.event?.title || "Event"}
              category={ticket.event?.category || ""}
              title={ticket.event?.title || ""}
              seed={ticket.event?.slug || ""}
              width={1200}
              height={480}
              className="aspect-[21/9] h-auto max-h-64 w-full object-cover object-center sm:max-h-72"
            />
            <span
              className={`absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${statusClass(ticket.status)}`}
            >
              {STATUS_LABEL[ticket.status] || ticket.status}
            </span>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
            <aside className="order-1 border-b border-stone-100 bg-[#f7f5fc] px-5 py-6 lg:order-2 lg:border-b-0 lg:border-l">
              {ticket.status === "CANCELLED" ? (
                <p className="text-sm text-ink/70">Tiket dibatalkan. Kode QR tidak ditampilkan.</p>
              ) : (
                <>
                  <p className="text-center text-xs font-semibold uppercase tracking-wide text-ink/45">Masuk venue</p>
                  <p className="mt-1 text-center text-sm font-medium text-ink">Tunjukkan QR kepada petugas</p>
                  {qrError ? (
                    <div className="mt-3">
                      <Alert tone="error" title={qrError} />
                    </div>
                  ) : null}
                  {qrUrl ? (
                    <figure className="mt-4">
                      <div className="relative mx-auto w-full max-w-[240px] rounded-2xl bg-white p-4 shadow-sm">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={qrUrl}
                          width={320}
                          height={320}
                          alt={`Kode QR tiket ${ticket.ticketNumber}`}
                          className="mx-auto h-auto w-full"
                        />
                        {ticket.status === "USED" ? (
                          <p className="absolute inset-x-3 bottom-3 rounded-full bg-white/95 px-2 py-1 text-center text-xs font-semibold text-emerald-800">
                            Sudah check-in
                          </p>
                        ) : null}
                      </div>
                      <figcaption className="mt-3 text-center text-xs text-ink/55">
                        {checkIn ? `${checkIn} ` : ""}
                        QR hanya berisi token check-in, bukan data pribadi.
                      </figcaption>
                    </figure>
                  ) : (
                    <p className="mt-6 text-center text-sm text-ink/55">Menyiapkan QR…</p>
                  )}
                  <div className="mt-5 rounded-2xl bg-white px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Kode cadangan</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="break-all font-mono text-sm tracking-wider text-ink">{ticket.manualCode}</span>
                      <Button variant="secondary" className="shrink-0 !min-h-9 !px-3 !py-1 text-xs" onClick={() => void copyCode()}>
                        {copied ? "Tersalin" : "Salin"}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2">
                    <Button className="w-full" onClick={() => void loadQr()}>
                      {qrUrl ? "Muat ulang QR" : "Tampilkan QR"}
                    </Button>
                    <Button className="w-full" variant="secondary" loading={pdfBusy} disabled={pdfBusy} onClick={() => void savePdf()}>
                      Unduh PDF tiket
                    </Button>
                  </div>
                  <p className="mt-3 text-center text-xs text-ink/50">
                    QR tidak disimpan di perangkat. Jangan bagikan layar ini kecuali kepada petugas.
                  </p>
                </>
              )}
            </aside>

            <div className="order-2 min-w-0 px-5 py-6 sm:px-6 lg:order-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">E-tiket</p>
              <h1 className="font-display mt-1 text-2xl text-ink sm:text-3xl">{ticket.event?.title || "Tiket"}</h1>

              <ul className="mt-4 space-y-2 text-sm text-ink/75">
                <li className="flex items-start gap-2">
                  <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
                  <span>{when}</span>
                </li>
                {place ? (
                  <li className="flex items-start gap-2">
                    <Icon name="pin" className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
                    <span>
                      {place}
                      {address ? <span className="mt-0.5 block text-ink/50">{address}</span> : null}
                    </span>
                  </li>
                ) : null}
                {checkIn ? (
                  <li className="flex items-start gap-2">
                    <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
                    <span>{checkIn}</span>
                  </li>
                ) : null}
              </ul>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-[#f7f5fc] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Jenis tiket</p>
                  <p className="mt-1 font-semibold text-ink">{ticket.ticketType?.name || "—"}</p>
                  {ticket.ticketType?.sectionName ? (
                    <p className="mt-0.5 text-sm text-ink/55">{ticket.ticketType.sectionName}</p>
                  ) : null}
                </div>
                <div className="rounded-2xl bg-[#f7f5fc] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Kursi / zona</p>
                  <p className="mt-1 font-semibold text-ink">{ticket.ticketType?.seatLabel || "Tanpa nomor kursi"}</p>
                </div>
              </div>

              <section className="mt-5 rounded-2xl border border-stone-100 px-4 py-4">
                <h2 className="text-sm font-semibold text-ink">Pemegang tiket</h2>
                <TicketHolderBiodata
                  holder={{
                    fullName: ticket.holder?.fullName,
                    email: ticket.holder?.email,
                    phone: ticket.holder?.phone,
                    identityNumber: ticket.holder?.identityNumber,
                    ownerName: ticket.owner?.name,
                  }}
                />
              </section>

              <dl className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-ink/45">Nomor tiket</dt>
                  <dd className="mt-0.5 break-all font-medium text-ink">{ticket.ticketNumber}</dd>
                </div>
                <div>
                  <dt className="text-ink/45">Order</dt>
                  <dd className="mt-0.5 font-medium text-ink">
                    {ticket.order?.id ? (
                      <Link href={`/orders/${ticket.order.id}`} className="text-gold-700 underline-offset-2 hover:underline">
                        {ticket.order.orderNumber}
                      </Link>
                    ) : (
                      ticket.order?.orderNumber || "—"
                    )}
                  </dd>
                </div>
              </dl>

              {ticket.event?.slug ? (
                <Link
                  href={`/events/${ticket.event.slug}`}
                  className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-gold-700 hover:underline"
                >
                  Lihat halaman event
                </Link>
              ) : null}
            </div>
          </div>
        </article>
      ) : null}
    </div>
  );
}
