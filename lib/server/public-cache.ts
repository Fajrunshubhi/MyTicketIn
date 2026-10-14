import { revalidateTag, unstable_cache } from "next/cache";

/**
 * Short-lived cache for the anonymous landing page only (published catalog, organizers, reviews). Inventory,
 * orders, payments and check-in never go through here and always read PostgreSQL directly; the cached cards
 * may show "Tersedia" up to TTL seconds late, and checkout re-checks the real quota anyway.
 */
export const PUBLIC_CATALOG_TAG = "public-catalog";
const TTL_SECONDS = 30;

export function cachedPublic<Args extends unknown[], T>(
  name: string,
  load: (...args: Args) => Promise<T>,
): (...args: Args) => Promise<T> {
  return unstable_cache(load, ["public", name], { revalidate: TTL_SECONDS, tags: [PUBLIC_CATALOG_TAG] });
}

/** Call after publish/cancel/review changes so visitors see them immediately instead of after the TTL. */
export function invalidatePublicCatalog(): void {
  try {
    revalidateTag(PUBLIC_CATALOG_TAG);
  } catch {
    // Outside a Next request (unit/integration tests, scripts) there is no cache to clear; the TTL still applies.
  }
}
