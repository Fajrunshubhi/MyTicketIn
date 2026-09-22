import { Suspense } from "react";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/shared/SiteFooter";
import { SiteHeader } from "@/components/shared/SiteHeader";
import { CatalogClient } from "@/components/events/CatalogClient";
import { Container } from "@/components/ui/Container";
import { LoadingState } from "@/components/ui/LoadingState";

export const metadata: Metadata = {
  title: "Katalog event — MyTicketIn",
  description: "Temukan event tatap muka Published di MyTicketIn.",
  alternates: { canonical: "/events" },
};

export default function EventsPage() {
  return (
    <div className="auth-shell min-h-screen">
      <SiteHeader />
      <main>
      <Container>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Event mendatang</h1>
        <p className="mt-2 max-w-2xl text-ink/65">Hanya event yang sudah dipublikasikan dan belum dimulai.</p>
        <div className="mt-8">
          <Suspense fallback={<LoadingState />}>
            <CatalogClient />
          </Suspense>
        </div>
      </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
