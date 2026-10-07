import { Suspense } from "react";
import { RouteLoading } from "@/components/ui/AppLoading";
import AdminSearchClient from "./AdminSearchClient";

export default function AdminSearchPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <AdminSearchClient />
    </Suspense>
  );
}
