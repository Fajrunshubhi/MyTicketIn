import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/shared/SiteFooter";
import { SiteHeader } from "@/components/shared/SiteHeader";
import { Container } from "@/components/ui/Container";
import { EventCard } from "@/components/events/EventCard";
import type { CatalogCard } from "@/components/events/catalog-types";
import { listOrganizerPublicEvents } from "@/lib/server/catalog";
import { getPublicOrganizer } from "@/lib/server/organizers";

export const dynamic = "force-dynamic";

async function loadOrganizer(id: string) {
  try {
    return await getPublicOrganizer(id);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const organizer = await loadOrganizer(params.id);
  if (!organizer) {
    return { title: "Penyelenggara tidak ditemukan — MyTicketIn" };
  }
  return {
    title: `${organizer.name} — MyTicketIn`,
    description: String(organizer.description || `Event milik ${organizer.name}`).slice(0, 160),
    alternates: { canonical: `/organizers/${organizer.id}` },
  };
}

export default async function OrganizerDetailPage({ params }: { params: { id: string } }) {
  const organizer = await loadOrganizer(params.id);
  if (!organizer) notFound();
  let upcoming: CatalogCard[] = [];
  let past: CatalogCard[] = [];
  try {
    const events = await listOrganizerPublicEvents(organizer.id);
    upcoming = events.upcoming;
    past = events.past;
  } catch {
    upcoming = [];
    past = [];
  }
  return (
    <div className="auth-shell min-h-screen">
      <SiteHeader />
      <main>
        <Container>
          <p className="text-sm">
            <Link href="/organizers" className="text-gold-700 underline-offset-2 hover:underline">
              Semua penyelenggara
            </Link>
          </p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-gold-700">Penyelenggara</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{organizer.name}</h1>
          {organizer.description ? (
            <p className="mt-3 max-w-2xl whitespace-pre-wrap text-ink/70">{organizer.description}</p>
          ) : (
            <p className="mt-3 max-w-2xl text-ink/65">Mitra event yang telah disetujui di MyTicketIn.</p>
          )}

          <section className="mt-10" aria-labelledby="org-upcoming-heading">
            <h2 id="org-upcoming-heading" className="text-2xl font-semibold tracking-tight text-ink">
              Event mendatang
            </h2>
            {upcoming.length === 0 ? (
              <p className="mt-4 text-ink/65">Belum ada event mendatang dari penyelenggara ini.</p>
            ) : (
              <ul className="mt-6 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((item) => (
                  <EventCard key={item.slug} item={item} />
                ))}
              </ul>
            )}
          </section>

          <section className="mt-12 pb-8" aria-labelledby="org-past-heading">
            <h2 id="org-past-heading" className="text-2xl font-semibold tracking-tight text-ink">
              Event yang telah selesai
            </h2>
            {past.length === 0 ? (
              <p className="mt-4 text-ink/65">Belum ada event selesai dari penyelenggara ini.</p>
            ) : (
              <ul className="mt-6 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
                {past.map((item) => (
                  <EventCard key={item.slug} item={item} />
                ))}
              </ul>
            )}
          </section>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
