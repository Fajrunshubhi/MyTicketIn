import { Suspense } from "react";
import AdminAuditClient from "./AdminAuditClient";

export default function AdminAuditPage() {
  return (
    <Suspense fallback={<p className="p-6">Memuat jejak audit…</p>}>
      <AdminAuditClient />
    </Suspense>
  );
}
