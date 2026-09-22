import { redirect } from "next/navigation";

export default function OrganizerEventPreviewRedirect({ params }: { params: { id: string } }) {
  redirect(`/dashboard/event/${params.id}/preview`);
}
