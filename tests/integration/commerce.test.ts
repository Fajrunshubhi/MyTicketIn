import { beforeAll, describe, expect, it } from "vitest";
import { query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import { createOrder } from "@/lib/server/orders";
import { createPayment, sandboxSettle } from "@/lib/server/payments";
import { checkIn } from "@/lib/server/checkin";
import { ticketQrPayload } from "@/lib/server/tickets";
import { counters, idem, seedEvent, seedOrganizer, seedSeat, seedTicketType, seedUser } from "./helpers";

let organizer: AuthUser;
let otherOrganizer: AuthUser;
let orgProfileId: string;

beforeAll(async () => {
  organizer = await seedUser("org");
  otherOrganizer = await seedUser("org2");
  orgProfileId = await seedOrganizer(organizer);
  await seedOrganizer(otherOrganizer);
});

const settled = <T>(results: PromiseSettledResult<T>[]) => ({
  ok: results.filter((r) => r.status === "fulfilled").length,
  failed: results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => (r.reason as { code?: string }).code),
});

describe("inventory under concurrency", () => {
  it("never oversells the last general-admission ticket", async () => {
    const eventId = await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION");
    const tt = await seedTicketType(eventId, 1);
    const buyers = await Promise.all([seedUser("b1"), seedUser("b2"), seedUser("b3")]);
    const res = await Promise.allSettled(
      buyers.map((b) => createOrder(b, { eventId, items: [{ ticketTypeId: tt, quantity: 1 }], confirmed: true }, idem())),
    );
    const { ok, failed } = settled(res);
    expect(ok).toBe(1);
    expect(failed.every((c) => c === "INVENTORY_UNAVAILABLE")).toBe(true);
    const c = await counters(tt);
    expect(c.reserved + c.paid).toBeLessThanOrEqual(c.quota);
    expect(c.reserved).toBe(1);
  });

  it("allows only one hold for the same seat and leaves counters consistent", async () => {
    const eventId = await seedEvent(orgProfileId, organizer.id, "RESERVED_SEATING");
    const tt = await seedTicketType(eventId, 5);
    const seatId = await seedSeat(eventId, tt, "A1");
    const buyers = await Promise.all([seedUser("s1"), seedUser("s2"), seedUser("s3")]);
    const res = await Promise.allSettled(buyers.map((b) => createOrder(b, { eventId, seatIds: [seatId], confirmed: true }, idem())));
    const { ok, failed } = settled(res);
    expect(ok).toBe(1);
    expect(failed.every((c) => c === "INVENTORY_UNAVAILABLE")).toBe(true);
    const active = await query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM inventory_reservations WHERE event_seat_id=$1 AND released_at IS NULL`, [seatId]);
    expect(Number(active[0].n)).toBe(1);
    // Losers must have released their counter: exactly one unit stays reserved.
    expect((await counters(tt)).reserved).toBe(1);
  });

  it("replays checkout with the same idempotency key without a second order", async () => {
    const eventId = await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION");
    const tt = await seedTicketType(eventId, 5);
    const buyer = await seedUser("idem");
    const key = idem();
    const body = { eventId, items: [{ ticketTypeId: tt, quantity: 2 }], confirmed: true };
    const first = await createOrder(buyer, body, key);
    const second = await createOrder(buyer, body, key);
    expect(second.replay).toBe(true);
    expect(String(second.view.id)).toBe(String(first.view.id));
    expect((await counters(tt)).reserved).toBe(2);
  });
});

describe("payment, ticket issuance and check-in", () => {
  it("issues exactly one ticket per unit, even when settlement is replayed", async () => {
    const eventId = await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION");
    const tt = await seedTicketType(eventId, 5);
    const buyer = await seedUser("pay");
    const { view } = await createOrder(buyer, { eventId, items: [{ ticketTypeId: tt, quantity: 2 }], confirmed: true }, idem());
    const orderId = String(view.id);
    await createPayment(buyer, orderId, "QRIS");
    await sandboxSettle(buyer, orderId);
    await expect(sandboxSettle(buyer, orderId)).rejects.toMatchObject({ code: "ORDER_CONFLICT" });
    const tickets = await query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM tickets WHERE order_id=$1`, [orderId]);
    expect(Number(tickets[0].n)).toBe(2);
    const c = await counters(tt);
    expect(c).toMatchObject({ reserved: 0, paid: 2 });
  });

  it("accepts a single check-in when the same ticket is scanned concurrently", async () => {
    const eventId = await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION");
    const tt = await seedTicketType(eventId, 3);
    const buyer = await seedUser("scan");
    const { view } = await createOrder(buyer, { eventId, items: [{ ticketTypeId: tt, quantity: 1 }], confirmed: true }, idem());
    const orderId = String(view.id);
    await createPayment(buyer, orderId, "QRIS");
    await sandboxSettle(buyer, orderId);
    const t = await query<{ id: string }>(`SELECT id FROM tickets WHERE order_id=$1`, [orderId]);
    const token = await ticketQrPayload(buyer, t[0].id);
    const scans = await Promise.all(
      [1, 2, 3, 4].map(() => checkIn(organizer, eventId, { inputType: "QR", value: token }, idem())),
    );
    expect(scans.filter((s) => s.result === "VALID")).toHaveLength(1);
    expect(scans.filter((s) => s.result === "ALREADY_USED")).toHaveLength(3);
    const status = await query<{ status: string }>(`SELECT status::text AS status FROM tickets WHERE id=$1`, [t[0].id]);
    expect(status[0].status).toBe("USED");
  });

  it("forbids another organizer from scanning this event", async () => {
    const eventId = await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION");
    await expect(checkIn(otherOrganizer, eventId, { inputType: "QR", value: "x" }, idem())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
