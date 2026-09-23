"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OrganizerBuyersPanel } from "@/components/dashboard/OrganizerBuyersPanel";
import { Alert } from "@/components/ui/Alert";

type EventOpt = { id: string; title: string };

export default function OrganizerPembeliClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const eventId = sp.get("eventId") || "";
  const [events, setEvents] = useState<EventOpt[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/organizer/dashboard", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace("/login?callbackUrl=/dashboard/pembeli&portal=organizer");
          return;
        }
        if (res.status === 403) {
          router.replace("/dashboard");
          return;
        }
        if (!res.ok) {
          setError("Daftar event gagal dimuat.");
          return;
        }
        const rows = ((body.data as { events?: EventOpt[] })?.events || []).map((ev) => ({
          id: ev.id,
          title: ev.title,
        }));
        setEvents(rows);
      })
      .catch(() => setError("Daftar event gagal dimuat."));
  }, [router]);

  return (
    <div>
      {error ? <Alert tone="error" title={error} /> : null}
      <OrganizerBuyersPanel
        events={events}
        selectedEventId={eventId}
        onSelectEvent={(id) => {
          router.push(id ? `/dashboard/pembeli?eventId=${encodeURIComponent(id)}` : "/dashboard/pembeli");
        }}
      />
    </div>
  );
}
