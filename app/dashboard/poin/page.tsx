import { Suspense } from "react";
import { redirect } from "next/navigation";
import { RouteLoading } from "@/components/ui/AppLoading";
import { loadSessionUser } from "@/lib/session";
import { LoyaltyClient } from "./LoyaltyClient";

export default async function DashboardLoyaltyPage() {
  const user = await loadSessionUser();
  if (!user) redirect("/login?callbackUrl=/dashboard/poin");
  return (
    <Suspense fallback={<RouteLoading />}>
      <LoyaltyClient />
    </Suspense>
  );
}
