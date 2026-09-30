import { describe, expect, it } from "vitest";
import { isNotificationType, NOTIFICATION_TYPE_LABEL } from "./notification-types";

describe("notification types", () => {
  it("labels every known type in Indonesian", () => {
    expect(NOTIFICATION_TYPE_LABEL.TICKET_ISSUED).toMatch(/Tiket/i);
    expect(NOTIFICATION_TYPE_LABEL.MODERATION_NEEDED).toMatch(/moderasi/i);
    expect(isNotificationType("TICKET_ISSUED")).toBe(true);
    expect(isNotificationType("NEWSLETTER")).toBe(false);
  });
});
