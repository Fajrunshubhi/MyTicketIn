import { Suspense } from "react";
import { redirect } from "next/navigation";
import { RouteLoading } from "@/components/ui/AppLoading";
import { loadSessionUser } from "@/lib/session";
import { BuyerRefundsClient } from "./BuyerRefundsClient";
import { OrganizerRefundsClient } from "./OrganizerRefundsClient";

export default async function DashboardRefundsPage() {
  const user = await loadSessionUser();
  if (!user) {
    redirect("/login?callbackUrl=/dashboard/refunds");
  }
  const organizer = user.access?.kind === "organizer";
  return (
    <Suspense fallback={<RouteLoading />}>
      {organizer ? <OrganizerRefundsClient /> : <BuyerRefundsClient />}
    </Suspense>
  );
}
