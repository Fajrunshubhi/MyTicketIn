import { Suspense } from "react";
import { requireOrganizer } from "@/lib/require-organizer";
import { RouteLoading } from "@/components/ui/AppLoading";
import OrganizerPembeliClient from "@/app/dashboard/pembeli/PageClient";

export default async function DashboardPembeliPage() {
  await requireOrganizer("/dashboard/pembeli");
  return (
    <Suspense fallback={<RouteLoading />}>
      <OrganizerPembeliClient />
    </Suspense>
  );
}
