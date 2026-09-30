import { Suspense } from "react";
import { RouteLoading } from "@/components/ui/AppLoading";
import AdminRefundsClient from "./AdminRefundsClient";

export default function AdminRefundsPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <AdminRefundsClient />
    </Suspense>
  );
}
