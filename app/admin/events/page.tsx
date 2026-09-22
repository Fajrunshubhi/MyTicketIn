import { Suspense } from "react";
import AdminEventsClient from "./AdminEventsClient";

export default function AdminEventsPage() {
  return (
    <Suspense fallback={<p className="p-6">Memuat antrean event…</p>}>
      <AdminEventsClient />
    </Suspense>
  );
}
