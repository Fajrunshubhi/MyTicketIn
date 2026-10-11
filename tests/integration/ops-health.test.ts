import { describe, expect, it } from "vitest";
import { adminOperationsHealth, healthAlerts } from "@/lib/server/reporting";

describe("admin operations health (F58)", () => {
  it("reads real aggregates from the database without sensitive fields", async () => {
    const h = await adminOperationsHealth();
    expect(h.schemaVersion).toBeGreaterThanOrEqual(34);
    for (const k of ["webhookFailures", "expiryLagOrders", "notificationLag", "notificationFailures", "openReconciliations"] as const) {
      expect(Number.isInteger(h[k])).toBe(true);
      expect(h[k]).toBeGreaterThanOrEqual(0);
    }
    expect(Array.isArray(h.alerts)).toBe(true);
    expect(JSON.stringify(h)).not.toMatch(/postgres(ql)?:\/\/|password|secret/i);
  });

  it("raises an alert only for non-zero counters", () => {
    const zero = { webhookFailures: 0, expiryLagOrders: 0, notificationLag: 0, notificationFailures: 0, openReconciliations: 0 };
    expect(healthAlerts(zero)).toEqual([]);
    expect(healthAlerts({ ...zero, webhookFailures: 2, openReconciliations: 1 })).toHaveLength(2);
  });
});
