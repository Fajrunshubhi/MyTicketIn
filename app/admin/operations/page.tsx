import { Suspense } from "react";
import { RouteLoading } from "@/components/ui/AppLoading";
import AdminOperationsClient from "./AdminOperationsClient";

export default function AdminOperationsPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <AdminOperationsClient />
    </Suspense>
  );
}
