import { Suspense } from "react";
import { redirect } from "next/navigation";
import { RouteLoading } from "@/components/ui/AppLoading";
import { loadSessionUser } from "@/lib/session";
import { PayoutsClient } from "./PayoutsClient";

export default async function DashboardPayoutsPage() {
  const user = await loadSessionUser();
  if (!user) redirect("/login?callbackUrl=/dashboard/payouts");
  if (user.access?.kind !== "organizer") redirect("/dashboard");
  return (
    <Suspense fallback={<RouteLoading />}>
      <PayoutsClient />
    </Suspense>
  );
}
