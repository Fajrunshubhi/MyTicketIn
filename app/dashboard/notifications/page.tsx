import { NotificationInbox } from "@/components/notifications/NotificationInbox";
import { requireOrganizer } from "@/lib/require-organizer";

export default async function DashboardNotificationsPage() {
  await requireOrganizer("/dashboard/notifications");
  return <NotificationInbox />;
}
