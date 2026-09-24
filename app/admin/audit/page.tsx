import { Suspense } from "react";
import { RouteLoading } from "@/components/ui/AppLoading";
import AdminAuditClient from "./AdminAuditClient";

export default function AdminAuditPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <AdminAuditClient />
    </Suspense>
  );
}
