import { Suspense } from "react";
import { requireOrganizer } from "@/lib/require-organizer";
import { RouteLoading } from "@/components/ui/AppLoading";
import { DashboardEventList } from "./EventList";

export default async function DashboardEventPage() {
  await requireOrganizer("/dashboard/event");
  return (
    <Suspense fallback={<RouteLoading />}>
      <DashboardEventList />
    </Suspense>
  );
}
