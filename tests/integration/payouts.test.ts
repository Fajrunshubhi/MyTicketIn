import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execute, query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import { createOrder } from "@/lib/server/orders";
import { createPayment, settlePaidOrder } from "@/lib/server/payments";
import {
  listAdminPayouts,
  listOrganizerPayouts,
  markPayoutPaid,
  organizerPayoutOverview,
  readPayoutProof,
  rejectPayout,
  requestPayout,
} from "@/lib/server/payouts";
import { decideOrganizerRefund, requestBuyerRefund } from "@/lib/server/refunds";
import { idem, seedEvent, seedOrganizer, seedTicketType, seedUser } from "./helpers";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const BANK = { bankName: "BCA", accountName: "Pembeli Uji", accountNumber: "1234567890" };
const savedHold = process.env.PAYOUT_HOLD_HOURS;

let organizer: AuthUser;
let admin: AuthUser;
let orgProfileId: string;

beforeAll(async () => {
  process.env.PAYOUT_HOLD_HOURS = "0";
  organizer = await seedUser("payorg");
  admin = await seedUser("payadmin", "ADMIN");
  orgProfileId = await seedOrganizer(organizer);
  await execute(
    `UPDATE organizer_profiles SET bank_name='BCA', bank_account_name='Penyelenggara Uji', bank_account_number='9876543210' WHERE id=$1`,
    [orgProfileId],
  );
});

afterAll(() => {
  if (savedHold === undefined) delete process.env.PAYOUT_HOLD_HOURS;
  else process.env.PAYOUT_HOLD_HOURS = savedHold;
});

async function paidEvent(qty = 2, price = 50000) {
  const buyer = await seedUser("paybuyer");
  const eventId = await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION");
  const tt = await seedTicketType(eventId, 10, price);
  const { view } = await createOrder(buyer, { eventId, items: [{ ticketTypeId: tt, quantity: qty }], confirmed: true }, idem());
  const orderId = String(view.id);
  const { payment } = await createPayment(buyer, orderId, "QRIS");
  expect(await settlePaidOrder(orderId, String(payment.id))).toBe(true);
  return { buyer, eventId, orderId };
}

const endEvent = (eventId: string) =>
  execute(
    `UPDATE events SET starts_at = CURRENT_TIMESTAMP - INTERVAL '2 days', ends_at = CURRENT_TIMESTAMP - INTERVAL '1 day' WHERE id=$1`,
    [eventId],
  );

describe("organizer payouts (sandbox)", () => {
  it("is blocked until the event has ended", async () => {
    const { eventId } = await paidEvent();
    await expect(requestPayout(organizer.id, orgProfileId, eventId)).rejects.toMatchObject({ code: "PAYOUT_NOT_ALLOWED", status: 409 });
    const ov = await organizerPayoutOverview(orgProfileId);
    expect(ov.events.find((e) => e.eventId === eventId)?.blockedBy).toBe("NOT_ENDED");
  });

  it("honours the hold period after the event ends", async () => {
    process.env.PAYOUT_HOLD_HOURS = "48";
    try {
      const { eventId } = await paidEvent();
      await endEvent(eventId);
      const ov = await organizerPayoutOverview(orgProfileId);
      expect(ov.events.find((e) => e.eventId === eventId)?.blockedBy).toBe("HOLD");
      await expect(requestPayout(organizer.id, orgProfileId, eventId)).rejects.toMatchObject({ code: "PAYOUT_NOT_ALLOWED" });
    } finally {
      process.env.PAYOUT_HOLD_HOURS = "0";
    }
  });

  it("waits for open refunds, then pays the net exactly once under concurrent requests", async () => {
    const { buyer, eventId, orderId } = await paidEvent(2, 50000);
    await endEvent(eventId);

    const refund = (await requestBuyerRefund(buyer.id, orderId, "Berhalangan hadir", BANK)) as { id: string };
    await expect(requestPayout(organizer.id, orgProfileId, eventId)).rejects.toMatchObject({ code: "PAYOUT_NOT_ALLOWED" });
    await decideOrganizerRefund(organizer.id, orgProfileId, refund.id, "REJECT", "Alasan tidak memenuhi syarat");

    const results = await Promise.allSettled([
      requestPayout(organizer.id, orgProfileId, eventId),
      requestPayout(organizer.id, orgProfileId, eventId),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const ok = results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof requestPayout>>>;
    expect(ok.value.amountRupiah).toBe(100_000);
    expect(ok.value.status).toBe("REQUESTED");
    // Organizer view never shows the full account number; admin view does.
    expect(ok.value.accountNumber).toMatch(/^\*+3210$/);
    const adminRow = (await listAdminPayouts("REQUESTED", 200)).find((p) => p.id === ok.value.id);
    expect(adminRow?.accountNumber).toBe("9876543210");

    // Money for this event is committed: no new refund may be created any more.
    await expect(requestBuyerRefund(buyer.id, orderId, "Terlambat mengajukan", BANK)).rejects.toMatchObject({
      code: "REFUND_NOT_ALLOWED",
    });
  });

  it("rejects with a reason, lets the organizer re-request, and pays once with proof", async () => {
    const { eventId } = await paidEvent(1, 75000);
    await endEvent(eventId);
    const first = await requestPayout(organizer.id, orgProfileId, eventId);

    await expect(rejectPayout(admin.id, first.id, "pendek")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await rejectPayout(admin.id, first.id, "Nomor rekening tidak sesuai dokumen.");
    await expect(markPayoutPaid(admin.id, first.id, PNG)).rejects.toMatchObject({ code: "PAYOUT_NOT_ALLOWED" });

    const second = await requestPayout(organizer.id, orgProfileId, eventId);
    expect(second.id).not.toBe(first.id);
    await expect(markPayoutPaid(admin.id, second.id, Buffer.from("bukan gambar"))).rejects.toBeTruthy();

    const paid = await markPayoutPaid(admin.id, second.id, PNG);
    expect(paid.status).toBe("PAID");
    expect(paid.hasTransferProof).toBe(true);
    await expect(markPayoutPaid(admin.id, second.id, PNG)).rejects.toMatchObject({ code: "PAYOUT_NOT_ALLOWED" });
    await expect(requestPayout(organizer.id, orgProfileId, eventId)).rejects.toMatchObject({ code: "PAYOUT_NOT_ALLOWED" });

    const audit = await query<{ action: string }>(
      `SELECT action FROM audit_logs WHERE entity_type='OrganizerPayout' AND entity_id=ANY($1::text[])`,
      [[first.id, second.id]],
    );
    expect(audit.map((a) => a.action).sort()).toEqual(["payout.paid", "payout.rejected"]);

    const mine = await listOrganizerPayouts(orgProfileId);
    expect(mine.find((p) => p.id === second.id)?.status).toBe("PAID");
  });

  it("keeps payouts and proofs private to the owning organizer and admins", async () => {
    const { eventId } = await paidEvent(1, 60000);
    await endEvent(eventId);
    const p = await requestPayout(organizer.id, orgProfileId, eventId);
    await markPayoutPaid(admin.id, p.id, PNG);

    const stranger = await seedUser("paystranger");
    const strangerProfile = await seedOrganizer(stranger);
    await expect(readPayoutProof(stranger.id, "USER", p.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(requestPayout(stranger.id, strangerProfile, eventId)).rejects.toBeTruthy();
    expect((await readPayoutProof(organizer.id, "USER", p.id)).bytes.equals(PNG)).toBe(true);
    expect((await readPayoutProof(admin.id, "ADMIN", p.id)).bytes.equals(PNG)).toBe(true);
  });

  it("refuses payout when the organizer has no bank account on file", async () => {
    const owner = await seedUser("nobankorg");
    const profileId = await seedOrganizer(owner);
    const buyer = await seedUser("nobankbuyer");
    const eventId = await seedEvent(profileId, owner.id, "GENERAL_ADMISSION");
    const tt = await seedTicketType(eventId, 5, 40000);
    const { view } = await createOrder(buyer, { eventId, items: [{ ticketTypeId: tt, quantity: 1 }], confirmed: true }, idem());
    const { payment } = await createPayment(buyer, String(view.id), "QRIS");
    await settlePaidOrder(String(view.id), String(payment.id));
    await endEvent(eventId);
    const ov = await organizerPayoutOverview(profileId);
    expect(ov.events.find((e) => e.eventId === eventId)?.blockedBy).toBe("NO_BANK");
    await expect(requestPayout(owner.id, profileId, eventId)).rejects.toMatchObject({ code: "PAYOUT_NOT_ALLOWED" });
  });
});
