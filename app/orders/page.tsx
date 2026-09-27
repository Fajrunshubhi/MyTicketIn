import { redirect } from "next/navigation";

export default function LegacyOrdersPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const status = searchParams.status ? `?status=${encodeURIComponent(searchParams.status)}` : "";
  redirect(`/dashboard/order${status}`);
}
