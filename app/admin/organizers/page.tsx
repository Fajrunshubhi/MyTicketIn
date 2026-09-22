import { Suspense } from "react";
import AdminOrganizersClient from "./AdminOrganizersClient";

export default function AdminOrganizersPage() {
  return (
    <Suspense fallback={<p className="p-6">Memuat antrean organizer…</p>}>
      <AdminOrganizersClient />
    </Suspense>
  );
}
