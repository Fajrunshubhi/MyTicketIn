import { Suspense } from "react";
import { CatalogClient } from "@/components/events/CatalogClient";
import { EventCard } from "@/components/events/EventCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { listPastCatalog } from "@/lib/server/catalog";
import type { CatalogCard } from "@/components/events/catalog-types";

async function loadPast(): Promise<{ items: CatalogCard[]; unavailable: boolean }> {
  try {
    return { items: await listPastCatalog(3), unavailable: false };
  } catch {
    return { items: [], unavailable: true };
  }
}

export async function EventsCatalogView({
  pastMode,
  basePath = "/events",
}: {
  pastMode: boolean;
  basePath?: string;
}) {
  const past = pastMode ? { items: [] as CatalogCard[], unavailable: false } : await loadPast();
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight text-ink">
        {pastMode ? "Event yang telah selesai" : "Event mendatang"}
      </h1>
      <p className="mt-2 max-w-2xl text-ink/65">
        {pastMode
          ? "Event yang sudah berlangsung. Tiket tidak lagi dijual."
          : "Hanya event yang sudah dipublikasikan dan belum dimulai."}
      </p>
      <div className="mt-8">
        <Suspense fallback={<LoadingState />}>
          <CatalogClient basePath={basePath} />
        </Suspense>
      </div>
      {pastMode ? null : (
        <section className="mt-16 pb-8" aria-labelledby="past-events-heading">
          <h2 id="past-events-heading" className="text-3xl font-semibold tracking-tight text-ink">
            Event yang telah selesai
          </h2>
          <p className="mt-2 max-w-2xl text-ink/65">Event yang sudah berlangsung. Tiket tidak lagi dijual.</p>
          {past.unavailable ? (
            <p className="mt-8 text-ink/65">Daftar event lampau sedang tidak tersedia.</p>
          ) : past.items.length === 0 ? (
            <p className="mt-8 text-ink/65">Belum ada event yang selesai ditampilkan.</p>
          ) : (
            <ul className="mt-8 grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
              {past.items.map((item) => (
                <EventCard key={item.slug} item={item} />
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
