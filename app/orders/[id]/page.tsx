import { redirect } from "next/navigation";

export default function LegacyOrderDetailPage({ params }: { params: { id: string } }) {
  redirect(`/dashboard/order/${params.id}`);
}
