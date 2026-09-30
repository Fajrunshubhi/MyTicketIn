import { describe, expect, it } from "vitest";
import { isNotificationType, NOTIFICATION_TYPE_LABEL, resolveNotificationActionPath } from "./notification-types";

describe("notification types", () => {
  it("labels every known type in Indonesian", () => {
    expect(NOTIFICATION_TYPE_LABEL.TICKET_ISSUED).toMatch(/Tiket/i);
    expect(NOTIFICATION_TYPE_LABEL.PAYMENT_INSTRUCTIONS).toMatch(/pembayaran/i);
    expect(NOTIFICATION_TYPE_LABEL.MODERATION_NEEDED).toMatch(/moderasi/i);
    expect(isNotificationType("TICKET_ISSUED")).toBe(true);
    expect(isNotificationType("PAYMENT_INSTRUCTIONS")).toBe(true);
    expect(isNotificationType("NEWSLETTER")).toBe(false);
  });

  it("maps organizer refund inbox links to the refund queue", () => {
    expect(resolveNotificationActionPath("REFUND_UPDATED", "/dashboard/notifications", "rf1")).toBe(
      "/dashboard/refunds?refund=rf1",
    );
    expect(resolveNotificationActionPath("REFUND_UPDATED", "/dashboard/order/o1", "rf1")).toBe("/dashboard/order/o1");
  });
});
