import { Suspense } from "react";
import AdminOperationsClient from "./AdminOperationsClient";

export default function AdminOperationsPage() {
  return (
    <Suspense fallback={<p className="p-6">Memuat antrean operasional…</p>}>
      <AdminOperationsClient />
    </Suspense>
  );
}
