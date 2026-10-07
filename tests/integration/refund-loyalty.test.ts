import { beforeAll, describe, expect, it } from "vitest";
import { execute, newId, query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import { createOrder } from "@/lib/server/orders";
import { createPayment, sandboxSettle } from "@/lib/server/payments";
import {
  completeSandboxRefund,
  confirmOrganizerTransfer,
  decideOrganizerRefund,
  decideRefund,
  requestBuyerRefund,
  requestRefund,
} from "@/lib/server/refunds";
import { REFUND_BANKS } from "@/lib/server/refund-policy";
import { renderTicketQrPng } from "@/lib/server/qr-png";
import {
  idem,
  seedEvent,
  seedOrganizer,
  seedTicketType,
  seedUser,
} from "./helpers";

let organizer: AuthUser;
let admin: AuthUser;
let orgProfileId: string;

const bank = {
  bankName: REFUND_BANKS[0],
  accountName: "Budi Santoso",
  accountNumber: "1234567890",
};

beforeAll(async () => {
  organizer = await seedUser("lrorg");
  admin = await seedUser("lradmin", "ADMIN");
  orgProfileId = await seedOrganizer(organizer);
});

async function paidOrder(
  buyer: AuthUser,
  balance: number,
  redeemPoints: number,
) {
  const eventId = await seedEvent(
    orgProfileId,
    organizer.id,
    "GENERAL_ADMISSION",
  );
  const tt = await seedTicketType(eventId, 10, 100_000);
  let accountId: string | null = null;
  if (balance > 0) {
    accountId = newId();
    await execute(
      `INSERT INTO loyalty_accounts (id, buyer_user_id, organizer_profile_id, balance_points) VALUES ($1,$2,$3,$4)`,
      [accountId, buyer.id, orgProfileId, balance],
    );
  }
  const { view } = await createOrder(
    buyer,
    {
      eventId,
      items: [{ ticketTypeId: tt, quantity: 2 }],
      confirmed: true,
      redeemPoints,
    },
    idem(),
  );
  const orderId = String(view.id);
  await createPayment(buyer, orderId, "QRIS");
  await sandboxSettle(buyer, orderId);
  return { orderId, accountId };
}

const ledger = async (orderId: string) =>
  query<{ entry_type: string; points_delta: string }>(
    `SELECT entry_type::text AS entry_type, points_delta::text AS points_delta FROM loyalty_ledger_entries
     WHERE order_id=$1 ORDER BY entry_type`,
    [orderId],
  );
const account = async (id: string) =>
  (
    await query<{ balance_points: string; debt_points: string }>(
      `SELECT balance_points::text, debt_points::text FROM loyalty_accounts WHERE id=$1`,
      [id],
    )
  )[0];

describe("loyalty on refund", () => {
  it("full refund reverses earned points and restores redeemed points exactly once", async () => {
    const buyer = await seedUser("lrfull");
    // Rp200.000 minus 500 pts (Rp5.000) = Rp195.000 payable -> earns 195.
    const { orderId, accountId } = await paidOrder(buyer, 500, 500);
    expect(await account(accountId!)).toEqual({
      balance_points: "195",
      debt_points: "0",
    });

    const rf = (await requestRefund(
      admin.id,
      orderId,
      195_000,
      "Refund penuh untuk pengujian",
    )) as { id: string };
    await decideRefund(admin.id, rf.id, "APPROVE", "Disetujui admin untuk uji");
    // Replays and concurrent completion must not apply loyalty again.
    await Promise.allSettled([
      completeSandboxRefund(rf.id),
      completeSandboxRefund(rf.id),
    ]);

    expect(await ledger(orderId)).toEqual([
      { entry_type: "EARN", points_delta: "195" },
      { entry_type: "EARN_REVERSAL", points_delta: "-195" },
      { entry_type: "REDEEM_DEBIT", points_delta: "-500" },
      { entry_type: "REDEEM_RESTORE", points_delta: "500" },
    ]);
    const o = await query<{
      status: string;
      loyalty_redeemed_restored: boolean;
      loyalty_reversed_points: string;
    }>(
      `SELECT status::text AS status, loyalty_redeemed_restored, loyalty_reversed_points::text FROM orders WHERE id=$1`,
      [orderId],
    );
    expect(o[0]).toMatchObject({
      status: "REFUNDED",
      loyalty_redeemed_restored: true,
      loyalty_reversed_points: "195",
    });
    const acc = await account(accountId!);
    expect(Number(acc.balance_points)).toBe(695); // 195 earned + 500 restored; reversal is tracked as debt
    expect(Number(acc.debt_points)).toBe(195);
  });

  it("partial buyer refund reverses a proportional share of earned points and restores nothing", async () => {
    const buyer = await seedUser("lrpart");
    const { orderId } = await paidOrder(buyer, 0, 0); // Rp200.000 -> earns 200
    const req = (await requestBuyerRefund(
      buyer.id,
      orderId,
      "Berhalangan hadir",
      bank,
    )) as { id: string; amountRupiah: number };
    expect(req.amountRupiah).toBe(150_000);
    await decideOrganizerRefund(
      organizer.id,
      orgProfileId,
      req.id,
      "APPROVE",
      "Disetujui penyelenggara",
    );
    await confirmOrganizerTransfer(
      organizer.id,
      orgProfileId,
      req.id,
      await renderTicketQrPng("proof-loyalty"),
    );

    // Remaining Rp50.000 keeps 50 points; 150 are reversed.
    expect(
      (await ledger(orderId)).map((l) => [l.entry_type, l.points_delta]),
    ).toEqual([
      ["EARN", "200"],
      ["EARN_REVERSAL", "-150"],
    ]);
    const o = await query<{ status: string }>(
      `SELECT status::text AS status FROM orders WHERE id=$1`,
      [orderId],
    );
    expect(o[0].status).toBe("PAID");
  });
});
