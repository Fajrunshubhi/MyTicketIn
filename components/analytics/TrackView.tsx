"use client";

import { useEffect } from "react";
import { trackEvent, type AnalyticsEventName } from "@/lib/analytics";

/** Lets Server Components record a page view without becoming client components. */
export function TrackView({
  eventName,
  entityType,
  entityId,
}: {
  eventName: AnalyticsEventName;
  entityType?: "event" | "order" | "catalog";
  entityId?: string;
}) {
  useEffect(() => {
    trackEvent({ eventName, entityType, entityId });
  }, [eventName, entityType, entityId]);
  return null;
}
