export const HERO_SLIDE_LIMIT = 6;
const POPULAR_SLOTS = 3;

export type HeroSlideCandidate = {
  id: string;
  startsAt: string;
  paidCount: number;
};

/** Mix most-purchased upcoming events with the soonest ones, never more than `limit`. */
export function pickHeroSlides<T extends HeroSlideCandidate>(candidates: T[], limit = HERO_SLIDE_LIMIT): T[] {
  const unique = new Map<string, T>();
  for (const item of candidates) unique.set(item.id, item);
  const pool = [...unique.values()];
  const soonest = [...pool].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
  const popular = [...pool]
    .filter((item) => item.paidCount > 0)
    .sort((a, b) => b.paidCount - a.paidCount || a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));

  const picked: T[] = [];
  const seen = new Set<string>();
  for (const item of popular.slice(0, POPULAR_SLOTS)) {
    picked.push(item);
    seen.add(item.id);
  }
  for (const item of soonest) {
    if (picked.length >= limit) break;
    if (seen.has(item.id)) continue;
    picked.push(item);
    seen.add(item.id);
  }
  return picked.slice(0, limit);
}
