import { Suspense } from "react";
import { requireOrganizer } from "@/lib/require-organizer";
import OrganizerPembeliClient from "@/app/dashboard/pembeli/PageClient";

export default async function DashboardPembeliPage() {
  await requireOrganizer("/dashboard/pembeli");
  return (
    <Suspense fallback={<p>Memuat pembeli…</p>}>
      <OrganizerPembeliClient />
    </Suspense>
  );
}
