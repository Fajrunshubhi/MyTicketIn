export type RatingSummary = { average: number; count: number };

export function emptyRatingSummary(): RatingSummary {
  return { average: 0, count: 0 };
}

export function formatEventRating(summary: RatingSummary): string {
  if (!summary.count) return "Belum ada rating";
  const avg = summary.average.toFixed(1).replace(".", ",");
  return `${avg} dari 5 · ${summary.count} ulasan`;
}
