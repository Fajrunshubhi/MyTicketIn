import type { ReactNode } from "react";
import { requireOrganizer } from "@/lib/require-organizer";

export default async function DashboardEventIdLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { id: string };
}) {
  await requireOrganizer(`/dashboard/event/${params.id}`);
  return children;
}
