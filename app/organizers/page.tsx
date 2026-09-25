import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/shared/SiteFooter";
import { SiteHeader } from "@/components/shared/SiteHeader";
import { Container } from "@/components/ui/Container";
import { OrganizerCard } from "@/components/landing/OrganizerPartners";
import { listLandingOrganizers, type LandingOrganizer } from "@/lib/server/organizers";

export const metadata: Metadata = {
  title: "Penyelenggara — MyTicketIn",
  description: "Daftar penyelenggara event yang telah disetujui di MyTicketIn.",
  alternates: { canonical: "/organizers" },
};

export default async function OrganizersPage() {
  let items: LandingOrganizer[] = [];
  try {
    items = await listLandingOrganizers(200);
  } catch {
    items = [];
  }
  return (
    <div className="auth-shell min-h-screen">
      <SiteHeader />
      <main>
        <Container>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Penyelenggara</h1>
          <p className="mt-2 max-w-2xl text-ink/65">Mitra event yang telah disetujui di MyTicketIn.</p>
          {items.length === 0 ? (
            <p className="mt-8 text-ink/65">Belum ada penyelenggara yang bergabung.</p>
          ) : (
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <li key={item.id}>
                  <Link href={`/organizers/${item.id}`} className="block h-full">
                    <OrganizerCard item={item} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
