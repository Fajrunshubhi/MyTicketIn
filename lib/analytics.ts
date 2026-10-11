import { apiFetch } from "@/lib/api";

export type AnalyticsEventName =
  | "catalog_viewed"
  | "event_viewed"
  | "checkout_started"
  | "search_submitted"
  | "ai_search_used";

type TrackInput = {
  eventName: AnalyticsEventName;
  entityType?: "event" | "order" | "catalog";
  entityId?: string;
  /** Only coarse, non-sensitive values (no search text, names, or emails). */
  properties?: Record<string, string | number | boolean>;
};

/** Fire-and-forget: analytics must never block or break the user flow. */
export function trackEvent(input: TrackInput): void {
  void apiFetch("/api/analytics/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    keepalive: true,
  }).catch(() => undefined);
}
