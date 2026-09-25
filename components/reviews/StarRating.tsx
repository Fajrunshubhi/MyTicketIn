import { formatEventRating, type RatingSummary } from "@/lib/reviews-format";

export function StarRating({ value, className = "text-sm text-gold-700" }: { value: number; className?: string }) {
  const n = Math.min(5, Math.max(0, Math.round(value)));
  return (
    <p className={className} aria-label={`${n} dari 5 bintang`}>
      <span aria-hidden="true">{"★".repeat(n)}{"☆".repeat(5 - n)}</span>
    </p>
  );
}

export function EventRatingSummary({ average, count, className = "" }: RatingSummary & { className?: string }) {
  return (
    <div className={className}>
      <StarRating value={count ? average : 0} />
      <p className="text-sm text-ink/70">{formatEventRating({ average, count })}</p>
    </div>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
  return letters.toUpperCase() || "P";
}
