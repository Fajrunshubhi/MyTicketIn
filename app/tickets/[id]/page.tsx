import { redirect } from "next/navigation";

export default function LegacyTicketDetailPage({ params }: { params: { id: string } }) {
  redirect(`/dashboard/ticket/${params.id}`);
}
