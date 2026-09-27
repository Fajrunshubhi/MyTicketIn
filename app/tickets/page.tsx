import { redirect } from "next/navigation";

export default function LegacyTicketsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const status = searchParams.status ? `?status=${encodeURIComponent(searchParams.status)}` : "";
  redirect(`/dashboard/ticket${status}`);
}
