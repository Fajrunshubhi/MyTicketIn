import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { sql: string; params: unknown[] };
const calls: Call[] = [];
let failSeatReservation = "";

vi.mock("@/lib/server/http", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/http")>("@/lib/server/http");
  const run = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const s = sql.replace(/\s+/g, " ");
    if (s.includes("FROM events WHERE id")) {
      return [{ id: "ev1", status: "PUBLISHED", title: "T", slug: "t", timezone: "Asia/Jakarta", organizer_profile_id: "org1", inventory_mode: "RESERVED_SEATING" }];
    }
    if (s.includes("FROM organizer_profiles WHERE id")) return [{ name: "Org", status: "APPROVED" }];
    if (s.includes("FROM event_seats s")) {
      const id = String(params[0]);
      return [{ id, label: id.toUpperCase(), section_name: "VIP", ticket_type_id: "tt1", ticket_name: "VIP", price_rupiah: 100000, quota: 10, reserved_quantity: 0, paid_quantity: 0 }];
    }
    if (s.includes("FROM inventory_reservations WHERE event_seat_id") || s.includes("FROM tickets WHERE event_seat_id")) return [];
    if (s.includes("INSERT INTO idempotency_keys")) return [];
    if (s.includes("FROM idempotency_keys")) return [{ id: calls.find((c) => c.sql.includes("INSERT INTO idempotency_keys"))?.params[0], status: "PROCESSING", request_hash: "", resource_id: null }];
    if (s.startsWith("INSERT INTO orders")) return [{ id: params[0] }];
    if (s.includes("UPDATE event_ticket_types SET reserved_quantity = reserved_quantity +")) return [{ reserved_quantity: 1 }];
    if (s.startsWith("INSERT INTO inventory_reservations") && params[4] === failSeatReservation) {
      throw new actual.AppError("INVENTORY_UNAVAILABLE", "Kursi sudah dipesan atau terjual.", {}, 409);
    }
    return [];
  };
  return { ...actual, query: vi.fn(run), execute: vi.fn(async (sql: string, params: unknown[] = []) => (await run(sql, params), 1)) };
});
vi.mock("@/lib/server/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/lib/server/tickets", () => ({ issueTicketsForPaidOrder: vi.fn() }));

import { createOrder } from "@/lib/server/orders";

const user = { id: "u1", role: "USER" } as never;
const key = "k".repeat(24);

describe("createOrder failure compensation", () => {
  beforeEach(() => {
    calls.length = 0;
    failSeatReservation = "";
  });

  it("raises the counter before inserting the reservation", async () => {
    await createOrder(user, { eventId: "ev1", seatIds: ["s1"], confirmed: true }, key).catch(() => undefined);
    const counter = calls.findIndex((c) => c.sql.includes("reserved_quantity = reserved_quantity +"));
    const reservation = calls.findIndex((c) => c.sql.includes("INSERT INTO inventory_reservations"));
    expect(counter).toBeGreaterThan(-1);
    expect(counter).toBeLessThan(reservation);
  });

  it("releases reservations, restores counters once, and cancels the order when a later seat is taken", async () => {
    failSeatReservation = "s2";
    await expect(createOrder(user, { eventId: "ev1", seatIds: ["s1", "s2"], confirmed: true }, key)).rejects.toMatchObject({
      code: "INVENTORY_UNAVAILABLE",
    });
    const release = calls.filter((c) => c.sql.includes("release_reason='CANCELLED'"));
    expect(release).toHaveLength(1);
    const decrements = calls.filter((c) => c.sql.includes("GREATEST(reserved_quantity - $2, 0)"));
    // Both lines had their counter raised before the second reservation failed.
    expect(decrements).toHaveLength(2);
    expect(decrements.every((c) => c.params[1] === 1)).toBe(true);
    const cancel = calls.filter((c) => c.sql.includes("cancellation_reason='CHECKOUT_FAILED'"));
    expect(cancel).toHaveLength(1);
  });

  it("does not roll back anything when checkout succeeds up to the idempotency completion", async () => {
    await createOrder(user, { eventId: "ev1", seatIds: ["s1"], confirmed: true }, key).catch(() => undefined);
    expect(calls.some((c) => c.sql.includes("cancellation_reason='CHECKOUT_FAILED'"))).toBe(false);
  });
});
