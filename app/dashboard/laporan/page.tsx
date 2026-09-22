import { Suspense } from "react";
import OrganizerDashboardClient from "@/app/organizer/dashboard/OrganizerDashboardClient";
import { requireOrganizer } from "@/lib/require-organizer";

export default async function DashboardLaporanPage() {
  await requireOrganizer("/dashboard/laporan");
  return (
    <Suspense fallback={<p>Memuat laporan…</p>}>
      <OrganizerDashboardClient embedded />
    </Suspense>
  );
}
