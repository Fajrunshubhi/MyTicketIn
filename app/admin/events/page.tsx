import { Suspense } from "react";
import { RouteLoading } from "@/components/ui/AppLoading";
import AdminEventsClient from "./AdminEventsClient";

export default function AdminEventsPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <AdminEventsClient />
    </Suspense>
  );
}
