import { redirect } from "next/navigation";

export default function OrganizerEventDetailRedirect({ params }: { params: { id: string } }) {
  redirect(`/dashboard/event/${params.id}`);
}
