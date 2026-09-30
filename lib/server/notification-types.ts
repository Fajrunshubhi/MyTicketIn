export const NOTIFICATION_TYPES = [
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
  TICKET_ISSUED: "Tiket",
  REFUND_UPDATED: "Refund",
  EVENT_REMINDER: "Pengingat event",
  PASSWORD_RESET_ASSISTED: "Keamanan akun",
  MODERATION_NEEDED: "Antrean moderasi",
};

export function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}
