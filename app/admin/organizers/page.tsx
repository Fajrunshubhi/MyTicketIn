import { Suspense } from "react";
import { RouteLoading } from "@/components/ui/AppLoading";
import AdminOrganizersClient from "./AdminOrganizersClient";

export default function AdminOrganizersPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <AdminOrganizersClient />
    </Suspense>
  );
}
