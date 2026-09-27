import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/server/http";
import { decisionHistoryType, historyDto, targetStatus } from "@/lib/server/organizers";

describe("organizer status transitions", () => {
  it("allows restore and dismiss appeal from suspended", () => {
    expect(targetStatus("SUSPENDED", "RESTORE")).toBe("APPROVED");
    expect(targetStatus("SUSPENDED", "REVOKE")).toBe("REJECTED");
    expect(targetStatus("SUSPENDED", "DISMISS_APPEAL")).toBe("SUSPENDED");
  });

  it("keeps historical data path by only suspending from approved", () => {
    expect(targetStatus("APPROVED", "SUSPEND")).toBe("SUSPENDED");
    expect(() => targetStatus("SUSPENDED", "REJECT")).toThrow(AppError);
  });

  it("maps admin decisions to history event types", () => {
    expect(decisionHistoryType("APPROVE")).toBe("APPROVED");
    expect(decisionHistoryType("SUSPEND")).toBe("SUSPENDED");
    expect(decisionHistoryType("RESTORE")).toBe("RESTORED");
    expect(decisionHistoryType("REVOKE")).toBe("REVOKED");
    expect(decisionHistoryType("DISMISS_APPEAL")).toBe("APPEAL_DISMISSED");
  });

  it("sanitizes history rows for owner and admin views", () => {
    const item = historyDto({
      id: "h1",
      occurred_at: "2026-09-27T15:00:00.000Z",
      actor_role: "ADMIN",
      event_type: "SUSPENDED",
      from_status: "APPROVED",
      to_status: "SUSPENDED",
      note: "Melakukan pelanggaran",
    });
    expect(item.actor).toBe("ADMIN");
    expect(item.type).toBe("SUSPENDED");
    expect(item.note).toBe("Melakukan pelanggaran");
  });
});
