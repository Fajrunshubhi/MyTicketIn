import { Suspense } from "react";
import { requireOrganizer } from "@/lib/require-organizer";
import { DashboardEventList } from "./EventList";

export default async function DashboardEventPage() {
  await requireOrganizer("/dashboard/event");
  return (
    <Suspense fallback={<p>Memuat event…</p>}>
      <DashboardEventList />
    </Suspense>
  );
}
