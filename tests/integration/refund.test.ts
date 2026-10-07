import { beforeAll, describe, expect, it } from "vitest";
import { query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import { createOrder } from "@/lib/server/orders";
import { createPayment, sandboxSettle } from "@/lib/server/payments";
import { confirmOrganizerTransfer, decideOrganizerRefund, requestBuyerRefund } from "@/lib/server/refunds";
import { REFUND_BANKS } from "@/lib/server/refund-policy";
import { renderTicketQrPng } from "@/lib/server/qr-png";
import { idem, seedEvent, seedOrganizer, seedTicketType, seedUser } from "./helpers";

let organizer: AuthUser;
let otherOrganizer: AuthUser;
let orgProfileId: string;
let otherProfileId: string;

const bank = { bankName: REFUND_BANKS[0], accountName: "Budi Santoso", accountNumber: "1234567890" };

beforeAll(async () => {
  organizer = await seedUser("rorg");
  otherOrganizer = await seedUser("rorg2");
  orgProfileId = await seedOrganizer(organizer);
  otherProfileId = await seedOrganizer(otherOrganizer);
});

async function paidOrder(buyer: AuthUser, quantity = 2) {
  const eventId = await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION");
  const tt = await seedTicketType(eventId, 10, 100_000);
  const { view } = await createOrder(buyer, { eventId, items: [{ ticketTypeId: tt, quantity }], confirmed: true }, idem());
  const orderId = String(view.id);
  await createPayment(buyer, orderId, "QRIS");
  await sandboxSettle(buyer, orderId);
  return { orderId };
}

describe("buyer refund lifecycle (F33)", () => {
  it("runs request, organizer approval with 24h hold, transfer proof, completion", async () => {
    const buyer = await seedUser("rbuyer");
    const { orderId } = await paidOrder(buyer);
    const req = (await requestBuyerRefund(buyer.id, orderId, "Berhalangan hadir", bank)) as { id: string; status: string; amountRupiah: number };
    expect(req.status).toBe("REQUESTED");
    // Buyer cancellation returns 75% of the 200.000 paid.
    expect(req.amountRupiah).toBe(150_000);

    // Another organizer cannot decide on this refund (object-level authorization).
    await expect(decideOrganizerRefund(otherOrganizer.id, otherProfileId, req.id, "APPROVE", "Setuju saja")).rejects.toBeTruthy();

    // Two simultaneous approvals: exactly one takes effect.
    const decisions = await Promise.allSettled([
      decideOrganizerRefund(organizer.id, orgProfileId, req.id, "APPROVE", "Disetujui penyelenggara"),
      decideOrganizerRefund(organizer.id, orgProfileId, req.id, "APPROVE", "Disetujui penyelenggara"),
    ]);
    expect(decisions.filter((d) => d.status === "fulfilled")).toHaveLength(1);

    const row = await query<{ status: string; transfer_due_at: string | null }>(`SELECT status::text AS status, transfer_due_at::text FROM refunds WHERE id=$1`, [req.id]);
    expect(row[0].status).toBe("APPROVED");
    expect(row[0].transfer_due_at).not.toBeNull();
    const tickets = await query<{ status: string }>(`SELECT status::text AS status FROM tickets WHERE order_id=$1`, [orderId]);
    expect(tickets.every((t) => t.status === "CANCELLED")).toBe(true);

    // The order remains PAID; only the refund tells the buyer story.
    const order = await query<{ status: string }>(`SELECT status::text AS status FROM orders WHERE id=$1`, [orderId]);
    expect(order[0].status).toBe("PAID");

    const proof = await renderTicketQrPng("proof-image-for-test");
    await confirmOrganizerTransfer(organizer.id, orgProfileId, req.id, proof);
    const done = await query<{ status: string; transferred_at: string | null }>(`SELECT status::text AS status, transferred_at::text FROM refunds WHERE id=$1`, [req.id]);
    expect(done[0].status).toBe("COMPLETED");
    expect(done[0].transferred_at).not.toBeNull();

    // A second transfer proof must not complete it again.
    await expect(confirmOrganizerTransfer(organizer.id, orgProfileId, req.id, proof)).rejects.toBeTruthy();
  });

  it("lets the buyer re-apply after a rejection and blocks other buyers' orders", async () => {
    const buyer = await seedUser("rbuyer2");
    const stranger = await seedUser("rstranger");
    const { orderId } = await paidOrder(buyer, 1);
    await expect(requestBuyerRefund(stranger.id, orderId, "Bukan pemilik", bank)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const first = (await requestBuyerRefund(buyer.id, orderId, "Percobaan pertama", bank)) as { id: string };
    await decideOrganizerRefund(organizer.id, orgProfileId, first.id, "REJECT", "Alasan tidak memenuhi syarat");
    const second = (await requestBuyerRefund(buyer.id, orderId, "Ajukan ulang dengan alasan lengkap", bank)) as { id: string; status: string };
    expect(second.status).toBe("REQUESTED");
    expect(second.id).not.toBe(first.id);
  });
});
