export const DUMMY_EVENT_COVER = "/dummy-events/jazz-1.jpg";

export function dummyCover(category: string, title = "", seed = ""): string {
  const blob = `${category} ${title} ${seed}`.toLowerCase();
  if (blob.includes("film") || blob.includes("teater") || blob.includes("pameran") || blob.includes("seni")) {
    return "/dummy-events/theater-1.jpg";
  }
  if (blob.includes("lari") || blob.includes("run") || blob.includes("olahraga")) return "/dummy-events/run-jakarta.jpg";
  if (blob.includes("kuliner") || blob.includes("food") || blob.includes("festival")) return "/dummy-events/food-1.jpg";
  if (blob.includes("seminar") || blob.includes("summit") || blob.includes("konferensi")) return "/dummy-events/summit-1.jpg";
  return DUMMY_EVENT_COVER;
}

export function isLocalGalleryUrl(url: string): boolean {
  const trimmed = String(url || "").trim();
  return trimmed.startsWith("/uploads/") || trimmed.includes("/uploads/gallery/");
}

/** Resolve a cover that actually exists on Vercel (static files in /public). */
export function eventImageSrc(url?: string | null, category = "", title = "", seed = ""): string {
  const trimmed = String(url || "").trim();
  if (!trimmed || isLocalGalleryUrl(trimmed)) return dummyCover(category, title, seed);
  return trimmed;
}
