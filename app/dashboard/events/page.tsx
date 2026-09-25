import type { Metadata } from "next";
import { EventsCatalogView } from "@/components/events/EventsCatalogView";

export const metadata: Metadata = {
  title: "Event — MyTicketIn",
  description: "Temukan event tatap muka Published di MyTicketIn.",
};

export default async function DashboardEventsPage({ searchParams }: { searchParams: { when?: string } }) {
  return <EventsCatalogView pastMode={searchParams.when === "past"} basePath="/dashboard/events" />;
}
