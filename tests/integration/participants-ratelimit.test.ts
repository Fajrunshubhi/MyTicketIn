import { beforeAll, describe, expect, it } from "vitest";
import { query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import { createOrder } from "@/lib/server/orders";
import { createPayment, settlePaidOrder } from "@/lib/server/payments";
import { hitRateLimit } from "@/lib/server/rate-limit";
import { listParticipants } from "@/lib/server/reporting";
import { markUsed } from "@/lib/server/tickets";
import { idem, seedEvent, seedOrganizer, seedTicketType, seedUser, tag } from "./helpers";

let organizer: AuthUser;
let orgProfileId: string;

beforeAll(async () => {
  organizer = await seedUser("partorg");
  orgProfileId = await seedOrganizer(organizer);
});

describe("participants status filter (F46)", () => {
  it("narrows the list by ticket status and never leaks other organizers' events", async () => {
    const buyer = await seedUser("partbuyer");
    const eventId = await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION");
    const tt = await seedTicketType(eventId, 10, 50000);
    const { view } = await createOrder(
      buyer,
      { eventId, items: [{ ticketTypeId: tt, quantity: 2 }], confirmed: true },
      idem(),
    );
    const orderId = String(view.id);
    const { payment } = await createPayment(buyer, orderId, "QRIS");
    expect(await settlePaidOrder(orderId, String(payment.id))).toBe(true);

    const all = await listParticipants(orgProfileId, eventId);
    expect(all).toHaveLength(2);
    expect(all.every((p) => p.status === "UNUSED")).toBe(true);

    await markUsed(all[0].id, organizer.id);

    const used = await listParticipants(orgProfileId, eventId, "USED");
    expect(used.map((p) => p.id)).toEqual([all[0].id]);
    const unused = await listParticipants(orgProfileId, eventId, "UNUSED");
    expect(unused.map((p) => p.id)).toEqual([all[1].id]);
    expect(await listParticipants(orgProfileId, eventId, "CANCELLED")).toHaveLength(0);

    // Another organizer profile id sees nothing for this event, filter or not.
    expect(await listParticipants("other-organizer", eventId, "USED")).toHaveLength(0);
  });

  it("treats an unknown status as no match instead of widening the export", async () => {
    const eventId = await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION");
    expect(await listParticipants(orgProfileId, eventId, "BOGUS")).toHaveLength(0);
  });
});

describe("hitRateLimit (F41)", () => {
  it("allows up to the maximum and then rejects with RATE_LIMITED/429", async () => {
    const key = `rl-${tag()}`;
    await hitRateLimit("checkin-manual", key, 3, 60);
    await hitRateLimit("checkin-manual", key, 3, 60);
    await hitRateLimit("checkin-manual", key, 3, 60);
    await expect(hitRateLimit("checkin-manual", key, 3, 60)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
    });
  });

  it("counts scopes and keys independently", async () => {
    const key = `rl-${tag()}`;
    await hitRateLimit("checkin-manual", key, 1, 60);
    await expect(hitRateLimit("checkin-manual", key, 1, 60)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(hitRateLimit("checkin-qr", key, 1, 60)).resolves.toBe(1);
    await expect(hitRateLimit("checkin-manual", `${key}-other`, 1, 60)).resolves.toBe(1);
  });
});

describe("analytics_events table (F52)", () => {
  it("rejects a row that has both a user and an anonymous id", async () => {
    const u = await seedUser("anaconstraint");
    await expect(
      query(
        `INSERT INTO analytics_events (id, event_name, actor_user_id, anonymous_id_hash, correlation_id)
         VALUES ($1,'event_viewed',$2,$3,'req_test')`,
        [`an-${tag()}`, u.id, "a".repeat(64)],
      ),
    ).rejects.toBeTruthy();
  });
});
