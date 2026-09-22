import { requireOrganizer } from "@/lib/require-organizer";
import { DashboardNewEventForm } from "./NewEventForm";

export default async function DashboardNewEventPage() {
  await requireOrganizer("/dashboard/event/new");
  return <DashboardNewEventForm />;
}
