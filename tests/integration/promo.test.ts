import { beforeAll, describe, expect, it } from "vitest";
import { execute, query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import { createOrder, failPendingOrder, summarize } from "@/lib/server/orders";
import { createPromo, listPromos, updatePromo } from "@/lib/server/promo";
import { idem, seedEvent, seedOrganizer, seedTicketType, seedUser, tag } from "./helpers";

let organizer: AuthUser;
let orgProfileId: string;
let otherOrganizer: AuthUser;
let otherProfileId: string;

beforeAll(async () => {
  organizer = await seedUser("porg");
  orgProfileId = await seedOrganizer(organizer);
  otherOrganizer = await seedUser("porg2");
  otherProfileId = await seedOrganizer(otherOrganizer);
});

const hour = 3_600_000;
const window = () => ({
  startsAt: new Date(Date.now() - hour).toISOString(),
  endsAt: new Date(Date.now() + 24 * hour).toISOString(),
});

async function setup(price = 100_000, quota = 20) {
  const eventId = await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION");
  const ticketTypeId = await seedTicketType(eventId, quota, price);
  return { eventId, ticketTypeId };
}

const promoRow = async (id: string) =>
  (await query<{ redeemed_count: number }>(`SELECT redeemed_count FROM promo_codes WHERE id=$1`, [id]))[0];

describe("F78 promo codes", () => {
  it("discounts the order, snapshots it, and keeps total = subtotal - promo", async () => {
    const { eventId, ticketTypeId } = await setup();
    const code = `HEMAT${tag()}`.toUpperCase();
    const promo = await createPromo(orgProfileId, eventId, {
      code: code.toLowerCase(),
      discountType: "PERCENT",
      discountValue: 10,
      ...window(),
    });
    expect(promo.code).toBe(code);
    const buyer = await seedUser("pbuyer");
    const body = {
      eventId,
      items: [{ ticketTypeId, quantity: 2 }],
      promoCode: ` ${code.toLowerCase()} `,
      confirmed: true,
    };

    const sum = await summarize(buyer, body);
    expect(sum).toMatchObject({
      subtotalRupiah: 200_000,
      promoDiscountRupiah: 20_000,
      totalPayableRupiah: 180_000,
      promoCode: code,
    });

    const { view } = await createOrder(buyer, body, idem());
    expect(view).toMatchObject({
      subtotalRupiah: 200_000,
      promoDiscountRupiah: 20_000,
      totalPayableRupiah: 180_000,
      promoCode: code,
    });
    expect((await promoRow(promo.id)).redeemed_count).toBe(1);
  });

  it("replays the same order for the same Idempotency-Key without consuming the code twice", async () => {
    const { eventId, ticketTypeId } = await setup();
    const promo = await createPromo(orgProfileId, eventId, {
      code: `RPL${tag()}`,
      discountType: "FIXED",
      discountValue: 10_000,
      ...window(),
    });
    const buyer = await seedUser("pbuyer");
    const body = { eventId, items: [{ ticketTypeId, quantity: 1 }], promoCode: promo.code, confirmed: true };
    const key = idem();
    const first = await createOrder(buyer, body, key);
    const again = await createOrder(buyer, body, key);
    expect(again.replay).toBe(true);
    expect(again.view.id).toBe(first.view.id);
    expect((await promoRow(promo.id)).redeemed_count).toBe(1);
  });

  it("allows one live use per buyer and frees it when the order fails", async () => {
    const { eventId, ticketTypeId } = await setup();
    const promo = await createPromo(orgProfileId, eventId, {
      code: `ONE${tag()}`,
      discountType: "FIXED",
      discountValue: 5_000,
      ...window(),
    });
    const buyer = await seedUser("pbuyer");
    const body = { eventId, items: [{ ticketTypeId, quantity: 1 }], promoCode: promo.code, confirmed: true };
    const first = await createOrder(buyer, body, idem());
    await expect(createOrder(buyer, body, idem())).rejects.toMatchObject({ code: "PROMO_ALREADY_USED" });
    expect((await promoRow(promo.id)).redeemed_count).toBe(1);

    expect(await failPendingOrder(String(first.view.id), "FAILED")).toBe(true);
    expect(await failPendingOrder(String(first.view.id), "FAILED")).toBe(false); // replay releases nothing more
    expect((await promoRow(promo.id)).redeemed_count).toBe(0);
    const retry = await createOrder(buyer, body, idem());
    expect(retry.view.promoDiscountRupiah).toBe(5_000);
  });

  it("never exceeds the quota when buyers race for the last use", async () => {
    const { eventId, ticketTypeId } = await setup(100_000, 50);
    const promo = await createPromo(orgProfileId, eventId, {
      code: `RACE${tag()}`,
      discountType: "FIXED",
      discountValue: 5_000,
      maxRedemptions: 1,
      ...window(),
    });
    const buyers = await Promise.all([1, 2, 3, 4, 5].map(() => seedUser("pbuyer")));
    const results = await Promise.allSettled(
      buyers.map((b) =>
        createOrder(b, { eventId, items: [{ ticketTypeId, quantity: 1 }], promoCode: promo.code, confirmed: true }, idem()),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) {
      if (r.status === "rejected") {
        expect(["PROMO_EXHAUSTED", "PROMO_ALREADY_USED"]).toContain((r.reason as { code: string }).code);
      }
    }
    expect((await promoRow(promo.id)).redeemed_count).toBe(1);
    const active = await query<{ n: string }>(
      `SELECT count(*)::text n FROM promo_redemptions WHERE promo_code_id=$1 AND status='ACTIVE'`,
      [promo.id],
    );
    expect(active[0].n).toBe("1");
  });

  it("answers unknown, wrong-event, disabled and early codes with the same message", async () => {
    const { eventId, ticketTypeId } = await setup();
    const other = await setup();
    const buyer = await seedUser("pbuyer");
    const make = (over: Record<string, unknown>) =>
      createPromo(orgProfileId, eventId, {
        code: `V${tag()}`,
        discountType: "FIXED",
        discountValue: 1_000,
        ...window(),
        ...over,
      });
    const early = await make({
      startsAt: new Date(Date.now() + hour).toISOString(),
      endsAt: new Date(Date.now() + 2 * hour).toISOString(),
    });
    const off = await make({});
    await updatePromo(orgProfileId, eventId, off.id, { status: "DISABLED" });
    const elsewhere = await createPromo(orgProfileId, other.eventId, {
      code: `W${tag()}`,
      discountType: "FIXED",
      discountValue: 1_000,
      ...window(),
    });
    const messages = new Set<string>();
    for (const code of ["NOPE9999", early.code, off.code, elsewhere.code]) {
      const err = await summarize(buyer, { eventId, items: [{ ticketTypeId, quantity: 1 }], promoCode: code }).catch(
        (e: unknown) => e,
      );
      expect(err).toMatchObject({ code: "PROMO_INVALID" });
      messages.add(String((err as Error).message));
    }
    expect(messages.size).toBe(1);
  });

  it("enforces the minimum purchase, and an expired code stops working", async () => {
    const { eventId, ticketTypeId } = await setup();
    const buyer = await seedUser("pbuyer");
    const min = await createPromo(orgProfileId, eventId, {
      code: `MIN${tag()}`,
      discountType: "FIXED",
      discountValue: 1_000,
      minSubtotalRupiah: 300_000,
      ...window(),
    });
    await expect(
      summarize(buyer, { eventId, items: [{ ticketTypeId, quantity: 1 }], promoCode: min.code }),
    ).rejects.toMatchObject({ code: "PROMO_MIN_SUBTOTAL" });
    const okSum = await summarize(buyer, { eventId, items: [{ ticketTypeId, quantity: 3 }], promoCode: min.code });
    expect(okSum.promoDiscountRupiah).toBe(1_000);

    await execute(
      `UPDATE promo_codes SET starts_at = CURRENT_TIMESTAMP - INTERVAL '2 hours', ends_at = CURRENT_TIMESTAMP - INTERVAL '1 hour' WHERE id=$1`,
      [min.id],
    );
    await expect(
      summarize(buyer, { eventId, items: [{ ticketTypeId, quantity: 3 }], promoCode: min.code }),
    ).rejects.toMatchObject({ code: "PROMO_INVALID" });
    expect((await listPromos(orgProfileId, eventId)).find((p) => p.id === min.id)?.state).toBe("EXPIRED");
  });

  it("caps a large fixed discount at 90% so an order is never free", async () => {
    const { eventId, ticketTypeId } = await setup(100_000);
    const promo = await createPromo(orgProfileId, eventId, {
      code: `BIG${tag()}`,
      discountType: "FIXED",
      discountValue: 9_000_000,
      ...window(),
    });
    const buyer = await seedUser("pbuyer");
    const out = await createOrder(
      buyer,
      { eventId, items: [{ ticketTypeId, quantity: 1 }], promoCode: promo.code, confirmed: true },
      idem(),
    );
    expect(out.view).toMatchObject({ promoDiscountRupiah: 90_000, totalPayableRupiah: 10_000 });
  });

  it("keeps codes private to the owning organizer and the discount immutable", async () => {
    const { eventId } = await setup();
    const promo = await createPromo(orgProfileId, eventId, {
      code: `OWN${tag()}`,
      discountType: "FIXED",
      discountValue: 2_000,
      maxRedemptions: 5,
      ...window(),
    });
    await expect(listPromos(otherProfileId, eventId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updatePromo(otherProfileId, eventId, promo.id, { status: "DISABLED" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      createPromo(otherProfileId, eventId, { code: "HACK123", discountType: "FIXED", discountValue: 1, ...window() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      createPromo(orgProfileId, eventId, { code: promo.code, discountType: "FIXED", discountValue: 1_000, ...window() }),
    ).rejects.toMatchObject({ code: "PROMO_CODE_EXISTS" });
    await expect(
      createPromo(orgProfileId, eventId, {
        code: `PCT${tag()}`,
        discountType: "PERCENT",
        discountValue: 95,
        ...window(),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const buyer = await seedUser("pbuyer");
    const ttId = await seedTicketType(eventId, 5, 50_000);
    await createOrder(
      buyer,
      { eventId, items: [{ ticketTypeId: ttId, quantity: 1 }], promoCode: promo.code, confirmed: true },
      idem(),
    );
    await expect(updatePromo(orgProfileId, eventId, promo.id, { maxRedemptions: 0 })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    const extended = await updatePromo(orgProfileId, eventId, promo.id, {
      endsAt: new Date(Date.now() + 72 * hour).toISOString(),
      maxRedemptions: 9,
    });
    expect(extended).toMatchObject({ discountValue: 2_000, maxRedemptions: 9, redeemedCount: 1 });
  });
});
