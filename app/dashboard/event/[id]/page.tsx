import { EventEditor } from "@/components/events/EventEditor";
import { requireOrganizer } from "@/lib/require-organizer";

export default async function DashboardEventDetailPage({ params }: { params: { id: string } }) {
  const user = await requireOrganizer(`/dashboard/event/${params.id}`);
  return (
    <div>
      <EventEditor eventId={params.id} readOnly={!user.access?.canOrganize} />
    </div>
  );
}
