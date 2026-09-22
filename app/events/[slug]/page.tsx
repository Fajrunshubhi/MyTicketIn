import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventDetail } from "@/components/events/EventDetail";
import { SiteFooter } from "@/components/shared/SiteFooter";
import { SiteHeader } from "@/components/shared/SiteHeader";
import { Container } from "@/components/ui/Container";
import { getPublicApiBaseUrl } from "@/lib/env";
import type { PublicEvent } from "@/components/events/catalog-types";

async function loadEvent(slug: string): Promise<PublicEvent | null> {
  const res = await fetch(`${getPublicApiBaseUrl()}/api/events/${encodeURIComponent(slug)}`, {
    next: { revalidate: 60 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("catalog");
  const body = (await res.json()) as { data?: { event?: PublicEvent } };
  return body.data?.event || null;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const event = await loadEvent(params.slug);
  if (!event) {
    return { title: "Event tidak ditemukan — MyTicketIn" };
  }
  return {
    title: `${event.title} — MyTicketIn`,
    description: event.description.slice(0, 160),
    alternates: { canonical: `/events/${event.slug}` },
    openGraph: { title: event.title, images: [{ url: event.image.url, alt: event.image.alt }] },
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
