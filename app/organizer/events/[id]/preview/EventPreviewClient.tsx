"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppHeader } from "@/components/shared/AppHeader";
import { Alert } from "@/components/ui/Alert";
import { Container } from "@/components/ui/Container";
import { LoadingState } from "@/components/ui/LoadingState";
import { formatCheckInBefore, formatDateTime, formatRupiah } from "@/lib/format";
import { readApiError } from "@/lib/api";
import { STATUS_LABEL, type EventRecord, type TicketTypeRecord } from "@/components/events/event-types";

export default function EventPreviewClient({ eventId }: { eventId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const embedded = pathname.startsWith("/dashboard");
  const eventHref = `/dashboard/event/${eventId}`;
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [tickets, setTickets] = useState<TicketTypeRecord[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/organizer/events/${eventId}`, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace(`/login?callbackUrl=${encodeURIComponent(`${eventHref}/preview`)}&portal=organizer`);
          return;
        }
        if (!res.ok) {
          setError(readApiError(body, "Pratinjau tidak tersedia."));
          return;
        }
        setEvent(body.data.event as EventRecord);
        setTickets((body.data.ticketTypes || []) as TicketTypeRecord[]);
      })
      .catch(() => setError("Tidak dapat terhubung ke layanan."));
  }, [eventId, eventHref, router]);

  const body = (
    <>
      <Alert tone="info" title="Pratinjau—tidak publik">Halaman ini hanya untuk owner organizer dan tidak mengubah status event.</Alert>
      {error ? <div className="mt-6"><Alert tone="error" title="Gagal">{error}</Alert></div> : null}
      {!event && !error ? <div className="mt-6"><LoadingState /></div> : null}
      {event ? (
        <article className="mt-6 space-y-4">
          <p className="text-sm text-ink/60">{STATUS_LABEL[event.status]}</p>
          <h1 className="font-display text-4xl text-ink">{event.title}</h1>
          <p className="whitespace-pre-wrap text-ink/80">{event.description}</p>
          <p>{event.venueName} · {event.addressLine} · {event.city}, {event.province}</p>
          {event.latitude != null && event.longitude != null ? (
            <p className="text-sm text-ink/70">Koordinat: {event.latitude}, {event.longitude}</p>
          ) : null}
          {event.tags && event.tags.length > 0 ? (
            <p>Tag: {event.tags.join(", ")}</p>
          ) : null}
          <p>
            <time dateTime={event.startsAt}>{formatDateTime(event.startsAt, event.timezone)}</time>
            {" – "}
            <time dateTime={event.endsAt}>{formatDateTime(event.endsAt, event.timezone)}</time>
          </p>
          <p className="text-sm font-medium text-ink/80">{formatCheckInBefore(event.startsAt, event.timezone)}</p>
          <h2 className="font-display text-2xl">Tiket</h2>
          <ul>
            {tickets.map((t) => (
              <li key={t.id}>{t.name} · {formatRupiah(t.priceRupiah)}</li>
            ))}
          </ul>
          <h2 className="font-display text-2xl">Syarat</h2>
          <p className="whitespace-pre-wrap">{event.terms}</p>
        </article>
      ) : null}
    </>
  );

  if (embedded) {
    return <div>{body}</div>;
  }

  return (
    <main id="main-content" className="auth-shell min-h-screen">
      <AppHeader homeHref="/dashboard" items={[{ href: eventHref, label: "Kembali" }]} />
      <Container>{body}</Container>
    </main>
  );
}
