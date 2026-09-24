import { Suspense } from "react";
import OrganizerDashboardClient from "@/app/organizer/dashboard/OrganizerDashboardClient";
import { requireOrganizer } from "@/lib/require-organizer";
import { RouteLoading } from "@/components/ui/AppLoading";

export default async function DashboardLaporanPage() {
  await requireOrganizer("/dashboard/laporan");
  return (
    <Suspense fallback={<RouteLoading />}>
      <OrganizerDashboardClient embedded />
    </Suspense>
  );
}
