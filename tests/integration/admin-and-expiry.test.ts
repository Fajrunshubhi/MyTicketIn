import { beforeAll, describe, expect, it } from "vitest";
import { execute, query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import { createOrder, expireOrderById } from "@/lib/server/orders";
import { createPayment, sandboxSettle } from "@/lib/server/payments";
import { adminSearch } from "@/lib/server/admin-search";
import { counters, idem, seedEvent, seedOrganizer, seedTicketType, seedUser } from "./helpers";

let organizer: AuthUser;
let orgProfileId: string;

beforeAll(async () => {
  organizer = await seedUser("xorg");
  orgProfileId = await seedOrganizer(organizer);
});

describe("order expiry", () => {
  it("releases the hold once when an unpaid order expires, and never touches a paid order", async () => {
    const eventId = await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION");
    const tt = await seedTicketType(eventId, 5);
    const buyer = await seedUser("exp");

    const unpaid = await createOrder(buyer, { eventId, items: [{ ticketTypeId: tt, quantity: 2 }], confirmed: true }, idem());
    await execute(`UPDATE orders SET created_at = CURRENT_TIMESTAMP - INTERVAL '20 minutes', expires_at = CURRENT_TIMESTAMP - INTERVAL '5 minutes' WHERE id=$1`, [String(unpaid.view.id)]);
    const runs = await Promise.all([expireOrderById(String(unpaid.view.id)), expireOrderById(String(unpaid.view.id))]);
    expect(runs.filter(Boolean)).toHaveLength(1);
    expect((await counters(tt)).reserved).toBe(0);

    const paid = await createOrder(buyer, { eventId, items: [{ ticketTypeId: tt, quantity: 1 }], confirmed: true }, idem());
    await createPayment(buyer, String(paid.view.id), "QRIS");
    await sandboxSettle(buyer, String(paid.view.id));
    expect(await expireOrderById(String(paid.view.id))).toBe(false);
    expect(await counters(tt)).toMatchObject({ reserved: 0, paid: 1 });
  });
});

describe("admin cross-entity search (F48)", () => {
  it("groups results by entity, exposes no secrets, and records an audit entry without the raw query", async () => {
    const admin = await seedUser("adm", "ADMIN");
    const needle = `zq${Math.random().toString(36).slice(2, 8)}`;
    const buyer = await seedUser(needle);
    const out = await adminSearch(admin.id, { q: needle, type: "all", page: 1 }, "corr-it-1");
    const users = out.groups.find((g) => g.type === "users");
    expect(users?.items.map((i) => i.id)).toContain(buyer.id);
    expect(JSON.stringify(out)).not.toMatch(/password|token|manual/i);

    const audit = await query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit_logs WHERE actor_user_id=$1 AND action='admin.search' ORDER BY occurred_at DESC LIMIT 1`,
      [admin.id],
    );
    expect(audit[0]?.metadata).toMatchObject({ type: "all", queryLength: needle.length });
    expect(JSON.stringify(audit[0]?.metadata)).not.toContain(needle);
  });

  it("treats LIKE wildcards literally and paginates a single entity", async () => {
    const admin = await seedUser("adm2", "ADMIN");
    const wild = await adminSearch(admin.id, { q: "%%", type: "users", page: 1 }, "corr-it-2");
    expect(wild.groups[0].items.every((i) => `${i.title}${i.subtitle}`.includes("%%") || i.id.includes("%%"))).toBe(true);
    const page1 = await adminSearch(admin.id, { q: "it_", type: "users", page: 1 }, "corr-it-3");
    expect(page1.groups[0].items.length).toBeLessThanOrEqual(20);
  });
});
