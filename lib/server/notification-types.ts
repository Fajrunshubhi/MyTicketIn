export const NOTIFICATION_TYPES = [
  "ORGANIZER_APPROVED",
  "ORGANIZER_REJECTED",
  "ORGANIZER_SUSPENDED",
  "EVENT_PUBLISHED",
  "EVENT_REJECTED",
  "EVENT_CANCELLED",
  "PAYMENT_SUCCEEDED",
  "PAYMENT_FAILED",
  "PAYMENT_INSTRUCTIONS",
  "TICKET_ISSUED",
  "REFUND_UPDATED",
  "EVENT_REMINDER",
  "PASSWORD_RESET_ASSISTED",
  "MODERATION_NEEDED",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  ORGANIZER_APPROVED: "Akun penyelenggara",
  ORGANIZER_REJECTED: "Akun penyelenggara",
  ORGANIZER_SUSPENDED: "Akun penyelenggara",
  EVENT_PUBLISHED: "Event",
  EVENT_REJECTED: "Event",
  EVENT_CANCELLED: "Event dibatalkan",
  PAYMENT_SUCCEEDED: "Pembayaran",
  PAYMENT_FAILED: "Pembayaran",
  PAYMENT_INSTRUCTIONS: "Kode pembayaran",
  TICKET_ISSUED: "Tiket",
  REFUND_UPDATED: "Refund",
  EVENT_REMINDER: "Pengingat event",
  PASSWORD_RESET_ASSISTED: "Keamanan akun",
  MODERATION_NEEDED: "Antrean moderasi",
};

export function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/** Tautan lama ke inbox sendiri tidak bisa dibuka; refund penyelenggara ke antrean keputusan. */
export function resolveNotificationActionPath(
  type: string,
  actionPath: string | null | undefined,
  entityId?: string | null,
): string | null {
  const path = actionPath || null;
  if (type === "REFUND_UPDATED" && (!path || path === "/dashboard/notifications")) {
    const id = (entityId || "").trim();
    return id ? `/dashboard/refunds?refund=${encodeURIComponent(id)}` : "/dashboard/refunds";
  }
  return path;
}

/** F50: types that also go out by email. Moderation queue, payment instructions, and security notices stay in-app only. */
const EMAIL_TYPES: readonly NotificationType[] = [
  "ORGANIZER_APPROVED",
  "ORGANIZER_REJECTED",
  "ORGANIZER_SUSPENDED",
  "EVENT_PUBLISHED",
  "EVENT_REJECTED",
  "EVENT_CANCELLED",
  "PAYMENT_SUCCEEDED",
  "PAYMENT_FAILED",
  "TICKET_ISSUED",
  "REFUND_UPDATED",
  "EVENT_REMINDER",
];

export function isEmailNotificationType(type: string): boolean {
  return (EMAIL_TYPES as readonly string[]).includes(type);
}

export const MAX_EMAIL_ATTEMPTS = 3;

/** Limited retry: 5 then 15 minutes; null means give up. */
export function emailRetryDelayMinutes(attemptsMade: number): number | null {
  if (attemptsMade >= MAX_EMAIL_ATTEMPTS) return null;
  return attemptsMade <= 1 ? 5 : 15;
}
