import { beforeAll, describe, expect, it } from "vitest";
import { execute, newId, query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import { createOrder } from "@/lib/server/orders";
import { createPayment, settlePaidOrder } from "@/lib/server/payments";
import { checkIn, listAttempts } from "@/lib/server/checkin";
import { ticketQrPayload } from "@/lib/server/tickets";
import { idem, seedEvent, seedOrganizer, seedTicketType, seedUser } from "./helpers";

let organizer: AuthUser;
let orgProfileId: string;

beforeAll(async () => {
  organizer = await seedUser("jorg");
  orgProfileId = await seedOrganizer(organizer);
});

async function buyTickets(eventId: string, ticketTypeId: string, quantity: number) {
  const buyer = await seedUser("jbuyer");
  const { view } = await createOrder(buyer, { eventId, items: [{ ticketTypeId, quantity }], confirmed: true }, idem());
  const orderId = String(view.id);
  const { payment } = await createPayment(buyer, orderId, "QRIS");
  expect(await settlePaidOrder(orderId, String(payment.id))).toBe(true);
  const tickets = await query<{ id: string; ticket_number: string }>(
    `SELECT id, ticket_number FROM tickets WHERE order_id=$1 ORDER BY unit_sequence`,
    [orderId],
  );
  return { buyer, orderId, tickets };
}

describe("journey: order → payment → ticket → check-in (F26–F40)", () => {
  it("checks in by QR once, then reports ALREADY_USED and records every attempt", async () => {
    const eventId = await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION");
    const tt = await seedTicketType(eventId, 5);
    const { buyer, tickets } = await buyTickets(eventId, tt, 1);

    const token = await ticketQrPayload(buyer, tickets[0].id);
    const first = await checkIn(organizer, eventId, { inputType: "QR", value: token }, idem());
    expect(first.result).toBe("VALID");
    const second = await checkIn(organizer, eventId, { inputType: "QR", value: token }, idem());
    expect(second.result).toBe("ALREADY_USED");

    const attempts = await listAttempts(organizer, eventId, 10);
    expect(JSON.stringify(attempts)).not.toContain(token); // token QR tidak boleh bocor ke log/riwayat
    const rows = await query<{ result: string }>(
      `SELECT result::text AS result FROM check_in_attempts WHERE event_id=$1 ORDER BY attempted_at`,
      [eventId],
    );
    expect(rows.map((r) => r.result)).toEqual(["VALID", "ALREADY_USED"]);
  });

  it("accepts the manual ticket number and rejects unknown codes as INVALID", async () => {
    const eventId = await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION");
    const tt = await seedTicketType(eventId, 5);
    const { tickets } = await buyTickets(eventId, tt, 1);

    const manual = await checkIn(organizer, eventId, { inputType: "MANUAL", value: tickets[0].ticket_number }, idem());
    expect(manual.result).toBe("VALID");
    const unknown = await checkIn(organizer, eventId, { inputType: "MANUAL", value: "TIDAK-ADA-123" }, idem());
    expect(unknown.result).toBe("INVALID");
  });

  it("rejects a ticket of another event and a cancelled ticket without marking them used", async () => {
    const eventA = await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION");
    const eventB = await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION");
    const ttA = await seedTicketType(eventA, 5);
    const { buyer, tickets } = await buyTickets(eventA, ttA, 2);

    const tokenA = await ticketQrPayload(buyer, tickets[0].id);
    const wrong = await checkIn(organizer, eventB, { inputType: "QR", value: tokenA }, idem());
    expect(wrong.result).toBe("WRONG_EVENT");

    await execute(
      `UPDATE tickets SET status='CANCELLED'::ticket_status, cancelled_at=CURRENT_TIMESTAMP,
         cancellation_source='REFUND_COMPLETED'::ticket_cancellation_source, cancellation_reference_id='it-refund'
       WHERE id=$1`,
      [tickets[1].id],
    );
    const cancelled = await checkIn(organizer, eventA, { inputType: "MANUAL", value: tickets[1].ticket_number }, idem());
    expect(cancelled.result).toBe("CANCELLED");

    const status = await query<{ id: string; status: string }>(
      `SELECT id, status::text AS status FROM tickets WHERE order_id IN (SELECT order_id FROM tickets WHERE id=$1)`,
      [tickets[0].id],
    );
    expect(status.find((s) => s.id === tickets[0].id)?.status).toBe("UNUSED");
  });

  it("lets an active staff member scan and blocks a revoked or unassigned one", async () => {
    const eventId = await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION");
    const tt = await seedTicketType(eventId, 5);
    const { tickets } = await buyTickets(eventId, tt, 2);
    const staff = await seedUser("jstaff");
    const stranger = await seedUser("jstranger");

    await expect(
      checkIn(stranger, eventId, { inputType: "MANUAL", value: tickets[0].ticket_number }, idem()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const assignmentId = newId();
    await execute(
      `INSERT INTO event_staff_assignments (id, event_id, user_id, status, assigned_by_user_id) VALUES ($1,$2,$3,'ACTIVE',$4)`,
      [assignmentId, eventId, staff.id, organizer.id],
    );
    const ok = await checkIn(staff, eventId, { inputType: "MANUAL", value: tickets[0].ticket_number }, idem());
    expect(ok.result).toBe("VALID");

    await execute(
      `UPDATE event_staff_assignments
       SET status='REVOKED', revoked_by_user_id=$2, revoked_at=CURRENT_TIMESTAMP, revocation_reason='Uji pencabutan akses'
       WHERE id=$1`,
      [assignmentId, organizer.id],
    );
    await expect(
      checkIn(staff, eventId, { inputType: "MANUAL", value: tickets[1].ticket_number }, idem()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
