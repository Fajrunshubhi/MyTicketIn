import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { EventCoverImg } from "@/components/events/EventCoverImg";
import { type EventRecord, STATUS_LABEL } from "@/components/events/event-types";
import { formatClockWithZone, formatDateTime } from "@/lib/format";

export function OrganizerEventCard({ event }: { event: EventRecord }) {
  const cover = event.galleryUrls?.[0];
  const place = [event.venueName, event.city].filter(Boolean).join(" · ") || "Lokasi belum diisi";
  return (
    <Link href={`/dashboard/event/${event.id}`} className="block overflow-hidden rounded-2xl border border-stone-100 bg-[#fbfcff]">
      <EventCoverImg
        src={cover}
        alt={event.title}
        category={event.category}
        title={event.title}
        seed={event.id}
        className="aspect-[16/10] w-full bg-stone-100 object-cover"
      />
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
            <time dateTime={event.startsAt}>{formatDateTime(event.startsAt, event.timezone)}</time>
          </p>
          <p className="inline-flex rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-ink/70">
            {STATUS_LABEL[event.status] || event.status}
          </p>
        </div>
        <p className="mt-3 font-semibold text-ink">{event.title}</p>
        <p className="mt-2 flex items-center gap-1 text-xs text-ink/50">
          <Icon name="clock" className="h-3.5 w-3.5 shrink-0" />
          {formatClockWithZone(event.startsAt, event.timezone)} – {formatClockWithZone(event.endsAt, event.timezone)}
        </p>
        <p className="mt-1 flex items-center gap-1 text-xs text-ink/50">
          <Icon name="pin" className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{place}</span>
        </p>
      </div>
    </Link>
  );
}
