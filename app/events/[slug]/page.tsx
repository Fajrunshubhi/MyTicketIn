import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventDetail } from "@/components/events/EventDetail";
import { SiteFooter } from "@/components/shared/SiteFooter";
import { SiteHeader } from "@/components/shared/SiteHeader";
import { Container } from "@/components/ui/Container";
import type { PublicEvent } from "@/components/events/catalog-types";
import { getPublicEvent } from "@/lib/server/catalog";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

async function loadEvent(slug: string): Promise<PublicEvent | null> {
  try {
    return (await getPublicEvent(slug)) as PublicEvent | null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const event = await loadEvent(params.slug);
  if (!event) {
    return { title: "Event tidak ditemukan — MyTicketIn" };
  }
  return {
    title: `${event.title} — MyTicketIn`,
    description: String(event.description || event.title).slice(0, 160),
    alternates: { canonical: `/events/${event.slug}` },
    openGraph: { title: event.title, images: [{ url: event.image?.url || "/dummy-events/jazz-1.jpg", alt: event.image?.alt || event.title }] },
  };
}

export default async function EventDetailPage({ params }: { params: { slug: string } }) {
  const event = await loadEvent(params.slug);
  if (!event) notFound();
  return (
    <div className="auth-shell min-h-screen">
      <SiteHeader />
      <main>
        <Container>
          <EventDetail event={event} />
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
