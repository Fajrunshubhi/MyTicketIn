import { OrganizerDashboardGate } from "./OrganizerDashboardGate";
import { loadSessionUser } from "@/lib/session";
import { BuyerWorkspace } from "@/components/dashboard/BuyerWorkspace";
import { AdminWorkspace } from "@/components/dashboard/AdminWorkspace";

export default async function DashboardPage() {
  const user = await loadSessionUser();
  if (user?.access?.canOrganize) {
    return <OrganizerDashboardGate />;
  }
  if (user?.access?.isAdmin || user?.role === "ADMIN") {
    return <AdminWorkspace />;
  }
  return <BuyerWorkspace />;
}
