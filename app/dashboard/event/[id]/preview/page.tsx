import EventPreviewClient from "@/app/organizer/events/[id]/preview/EventPreviewClient";
import { requireOrganizer } from "@/lib/require-organizer";

export default async function DashboardEventPreviewPage({ params }: { params: { id: string } }) {
  await requireOrganizer(`/dashboard/event/${params.id}/preview`);
  return <EventPreviewClient eventId={params.id} />;
}
