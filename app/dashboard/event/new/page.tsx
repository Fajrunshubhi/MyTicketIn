import { requireOrganizerWrite } from "@/lib/require-organizer";
import { DashboardNewEventForm } from "./NewEventForm";

export default async function DashboardNewEventPage() {
  await requireOrganizerWrite("/dashboard/event/new");
  return <DashboardNewEventForm />;
}
