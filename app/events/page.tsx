import type { Metadata } from "next";
import { SiteFooter } from "@/components/shared/SiteFooter";
import { SiteHeader } from "@/components/shared/SiteHeader";
import { EventsCatalogView } from "@/components/events/EventsCatalogView";
import { Container } from "@/components/ui/Container";

export const metadata: Metadata = {
  title: "Katalog event — MyTicketIn",
  description: "Temukan event tatap muka Published di MyTicketIn.",
  alternates: { canonical: "/events" },
};

export default async function EventsPage({ searchParams }: { searchParams: { when?: string } }) {
  const pastMode = searchParams.when === "past";
  return (
    <div className="auth-shell min-h-screen">
      <SiteHeader />
      <main>
        <Container>
          <EventsCatalogView pastMode={pastMode} basePath="/events" />
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
