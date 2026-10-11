import { Suspense } from "react";
import { RouteLoading } from "@/components/ui/AppLoading";
import AdminPayoutsClient from "./AdminPayoutsClient";

export default function AdminPayoutsPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <AdminPayoutsClient />
    </Suspense>
  );
}
