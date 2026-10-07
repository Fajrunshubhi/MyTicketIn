import { beforeAll, describe, expect, it } from "vitest";
import { execute, newId, query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import { createOrder, expireOrderById } from "@/lib/server/orders";
import { createPayment } from "@/lib/server/payments";
import {
  handlePaymentWebhook,
  signWebhookBody,
} from "@/lib/server/payment-webhook";
import {
  counters,
  idem,
  seedEvent,
  seedOrganizer,
  seedTicketType,
  seedUser,
} from "./helpers";

const SECRET = "integration-test-webhook-secret";
let organizer: AuthUser;
let orgProfileId: string;

beforeAll(async () => {
  organizer = await seedUser("whorg");
  orgProfileId = await seedOrganizer(organizer);
});

type Ctx = {
  buyer: AuthUser;
  eventId: string;
  tt: string;
  orderId: string;
  ref: string;
  amount: number;
};

async function checkout(
  opts: {
    price?: number;
    qty?: number;
    redeemPoints?: number;
    buyer?: AuthUser;
    eventId?: string;
    tt?: string;
  } = {},
): Promise<Ctx> {
  const buyer = opts.buyer ?? (await seedUser("whbuyer"));
  const eventId =
    opts.eventId ??
    (await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION"));
  const tt =
    opts.tt ?? (await seedTicketType(eventId, 20, opts.price ?? 50000));
  const { view } = await createOrder(
    buyer,
    {
      eventId,
      items: [{ ticketTypeId: tt, quantity: opts.qty ?? 2 }],
      confirmed: true,
      redeemPoints: opts.redeemPoints,
    },
    idem(),
  );
  const orderId = String(view.id);
  const { payment } = await createPayment(buyer, orderId, "QRIS");
  return {
    buyer,
    eventId,
    tt,
    orderId,
    ref: String(payment.externalReference),
    amount: Number(payment.amountRupiah),
  };
}

function send(
  c: Pick<Ctx, "ref" | "amount">,
  eventType: string,
  eventId = `evt-${newId()}`,
  overrides: Record<string, unknown> = {},
) {
  const raw = JSON.stringify({
    eventId,
    eventType,
    externalReference: c.ref,
    amountRupiah: c.amount,
    currency: "IDR",
    ...overrides,
  });
  return {
    raw,
    eventId,
    call: (sig = signWebhookBody(SECRET, raw)) =>
      handlePaymentWebhook({
        provider: "sandbox",
        rawBody: raw,
        signature: sig,
        ip: `10.0.0.${Math.floor(Math.random() * 250)}`,
      }),
  };
}

const orderStatus = async (id: string) =>
  (
    await query<{ status: string }>(
      `SELECT status::text AS status FROM orders WHERE id=$1`,
      [id],
    )
  )[0].status;
const ticketCount = async (id: string) =>
  Number(
    (
      await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM tickets WHERE order_id=$1`,
        [id],
      )
    )[0].n,
  );
const ledger = async (orderId: string) =>
  query<{ entry_type: string; points_delta: string }>(
    `SELECT entry_type::text AS entry_type, points_delta::text AS points_delta FROM loyalty_ledger_entries WHERE order_id=$1 ORDER BY entry_type`,
    [orderId],
  );

async function giveBalance(buyer: AuthUser, eventId: string, points: number) {
  const prof = await query<{ organizer_profile_id: string }>(
    `SELECT organizer_profile_id FROM events WHERE id=$1`,
    [eventId],
  );
  const id = newId();
  await execute(
    `INSERT INTO loyalty_accounts (id, buyer_user_id, organizer_profile_id, balance_points) VALUES ($1,$2,$3,$4)`,
    [id, buyer.id, prof[0].organizer_profile_id, points],
  );
  return id;
}
const acct = async (id: string) =>
  (
    await query<{ balance_points: string; reserved_points: string }>(
      `SELECT balance_points::text, reserved_points::text FROM loyalty_accounts WHERE id=$1`,
      [id],
    )
  )[0];

describe("payment webhook", () => {
  it("rejects invalid signatures with 401 and changes nothing", async () => {
    const c = await checkout();
    const w = send(c, "payment.succeeded");
    await expect(w.call("00".repeat(32))).rejects.toMatchObject({
      code: "WEBHOOK_SIGNATURE_INVALID",
    });
    await expect(w.call("not-hex")).rejects.toMatchObject({
      code: "WEBHOOK_SIGNATURE_INVALID",
    });
    expect(await orderStatus(c.orderId)).toBe("PENDING");
  });

  it("settles once on success and treats a duplicate delivery as replay", async () => {
    const c = await checkout();
    const w = send(c, "payment.succeeded");
    expect((await w.call()).body.outcome).toBe("PAID");
    const again = await w.call();
    expect(again.body.replay).toBe(true);
    expect(await orderStatus(c.orderId)).toBe("PAID");
    expect(await ticketCount(c.orderId)).toBe(2);
    expect(await counters(c.tt)).toMatchObject({ reserved: 0, paid: 2 });
  });

  it("processes concurrent duplicate deliveries effectively once", async () => {
    const c = await checkout();
    const w = send(c, "payment.succeeded");
    await Promise.allSettled([w.call(), w.call(), w.call()]);
    expect(await ticketCount(c.orderId)).toBe(2);
    expect(await counters(c.tt)).toMatchObject({ reserved: 0, paid: 2 });
    // different event id for the same reference must not double-issue either
    await send(c, "payment.succeeded").call();
    expect(await ticketCount(c.orderId)).toBe(2);
  });

  it("rejects an event id reused with a different payload", async () => {
    const c = await checkout();
    const w = send(c, "payment.failed");
    await w.call();
    const clash = send(c, "payment.succeeded", w.eventId);
    await expect(clash.call()).rejects.toMatchObject({
      code: "WEBHOOK_PAYLOAD_MISMATCH",
    });
  });

  it("opens an amount-mismatch reconciliation and leaves the order pending", async () => {
    const c = await checkout();
    const w = send(c, "payment.succeeded", undefined, {
      amountRupiah: c.amount - 1,
    });
    expect((await w.call()).body.outcome).toBe("AMOUNT_MISMATCH");
    expect(await orderStatus(c.orderId)).toBe("PENDING");
    const r = await query<{ reason_code: string }>(
      `SELECT reason_code FROM payment_reconciliations WHERE order_id=$1`,
      [c.orderId],
    );
    expect(r.map((x) => x.reason_code)).toEqual(["AMOUNT_MISMATCH"]);
  });

  it("failed payment releases stock once; a later success cannot resurrect the order", async () => {
    const c = await checkout();
    await send(c, "payment.failed").call();
    expect(await orderStatus(c.orderId)).toBe("FAILED");
    expect((await counters(c.tt)).reserved).toBe(0);
    const late = await send(c, "payment.succeeded").call();
    expect(late.body.outcome).toBe("LATE_SUCCESS");
    expect(await orderStatus(c.orderId)).toBe("FAILED");
    expect(await ticketCount(c.orderId)).toBe(0);
    const pay = await query<{ status: string }>(
      `SELECT status::text AS status FROM payments WHERE order_id=$1`,
      [c.orderId],
    );
    expect(pay[0].status).toBe("SUCCEEDED");
  });

  it("success after expiry creates a LATE_SUCCESS reconciliation and no tickets", async () => {
    const c = await checkout();
    await execute(
      `UPDATE orders SET created_at = CURRENT_TIMESTAMP - INTERVAL '20 minutes', expires_at = CURRENT_TIMESTAMP - INTERVAL '5 minutes' WHERE id=$1`,
      [c.orderId],
    );
    const res = await send(c, "payment.succeeded").call();
    expect(res.body.outcome).toBe("LATE_SUCCESS");
    expect(await orderStatus(c.orderId)).toBe("EXPIRED");
    expect(await ticketCount(c.orderId)).toBe(0);
    expect((await counters(c.tt)).reserved).toBe(0);
  });

  it("does not undo a Paid order when failure arrives out of order", async () => {
    const c = await checkout();
    await send(c, "payment.succeeded").call();
    const res = await send(c, "payment.failed").call();
    expect(res.body.outcome).toBe("ORDER_NOT_PENDING");
    expect(await orderStatus(c.orderId)).toBe("PAID");
    expect(await ticketCount(c.orderId)).toBe(2);
  });

  it("expiry racing a success webhook yields exactly one consistent outcome", async () => {
    const c = await checkout();
    await execute(
      `UPDATE orders SET created_at = CURRENT_TIMESTAMP - INTERVAL '20 minutes', expires_at = CURRENT_TIMESTAMP - INTERVAL '5 minutes' WHERE id=$1`,
      [c.orderId],
    );
    await Promise.allSettled([
      expireOrderById(c.orderId),
      send(c, "payment.succeeded").call(),
    ]);
    const status = await orderStatus(c.orderId);
    expect(status).toBe("EXPIRED");
    expect(await ticketCount(c.orderId)).toBe(0);
    const cn = await counters(c.tt);
    expect(cn.reserved).toBe(0);
    expect(cn.paid).toBe(0);
  });

  it("returns 202 for an unknown reference so the provider retries", async () => {
    const res = await send(
      { ref: "sandbox-unknown", amount: 1000 },
      "payment.succeeded",
    ).call();
    expect(res.status).toBe(202);
  });
});

async function pointsSetup(balance: number) {
  const buyer = await seedUser("lbuyer");
  const eventId = await seedEvent(
    orgProfileId,
    organizer.id,
    "GENERAL_ADMISSION",
  );
  const tt = await seedTicketType(eventId, 20, 50000);
  const acc = await giveBalance(buyer, eventId, balance);
  return { buyer, eventId, tt, acc };
}

describe("loyalty points", () => {
  it("earns 1 point per Rp1.000 once, even when webhooks replay", async () => {
    const c = await checkout({ price: 50000, qty: 2 });
    await send(c, "payment.succeeded").call();
    await send(c, "payment.succeeded").call();
    expect(await ledger(c.orderId)).toEqual([
      { entry_type: "EARN", points_delta: "100" },
    ]);
  });

  it("reserves points at checkout and converts them to exactly one debit on Paid", async () => {
    const { buyer, eventId, tt, acc } = await pointsSetup(500);
    const c = await checkout({ buyer, eventId, tt, qty: 2, redeemPoints: 500 });
    expect(c.amount).toBe(100000 - 5000);
    expect(await acct(acc)).toEqual({
      balance_points: "500",
      reserved_points: "500",
    });
    await send(c, "payment.succeeded").call();
    await send(c, "payment.succeeded").call();
    expect(await ledger(c.orderId)).toEqual([
      { entry_type: "EARN", points_delta: "95" },
      { entry_type: "REDEEM_DEBIT", points_delta: "-500" },
    ]);
    expect(await acct(acc)).toEqual({
      balance_points: "95",
      reserved_points: "0",
    });
  });

  it("lets only one of two concurrent checkouts reserve the same points", async () => {
    const { buyer, eventId, tt, acc } = await pointsSetup(100);
    const res = await Promise.allSettled([
      checkout({ buyer, eventId, tt, qty: 1, redeemPoints: 100 }),
      checkout({ buyer, eventId, tt, qty: 1, redeemPoints: 100 }),
    ]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = res.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    expect((failed.reason as { code?: string }).code).toBe(
      "LOYALTY_INSUFFICIENT_POINTS",
    );
    expect(await acct(acc)).toEqual({
      balance_points: "100",
      reserved_points: "100",
    });
    expect((await counters(tt)).reserved).toBe(1);
  });

  it("releases the reservation exactly once when payment fails, even on replay", async () => {
    const { buyer, eventId, tt, acc } = await pointsSetup(100);
    const c = await checkout({ buyer, eventId, tt, qty: 1, redeemPoints: 100 });
    const w = send(c, "payment.failed");
    await w.call();
    await w.call();
    await send(c, "payment.failed").call();
    expect(await acct(acc)).toEqual({
      balance_points: "100",
      reserved_points: "0",
    });
    expect(await ledger(c.orderId)).toEqual([]);
  });

  it("releases points on expiry and a racing success webhook never debits them", async () => {
    const { buyer, eventId, tt, acc } = await pointsSetup(100);
    const c = await checkout({ buyer, eventId, tt, qty: 1, redeemPoints: 100 });
    await execute(
      "UPDATE orders SET created_at = CURRENT_TIMESTAMP - INTERVAL '20 minutes', expires_at = CURRENT_TIMESTAMP - INTERVAL '5 minutes' WHERE id=$1",
      [c.orderId],
    );
    await Promise.allSettled([
      expireOrderById(c.orderId),
      send(c, "payment.succeeded").call(),
    ]);
    expect(await acct(acc)).toEqual({
      balance_points: "100",
      reserved_points: "0",
    });
    expect(await ledger(c.orderId)).toEqual([]);
  });
});

describe("crash between the PAID gate and the follow-up steps", () => {
  it("is completed by a webhook replay: counters convert once and tickets are issued once", async () => {
    const c = await checkout({ qty: 2 });
    // Simulate a crash right after the status gate: PAID, but nothing else happened.
    await execute(
      `UPDATE orders SET status='PAID'::order_status, paid_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=$1`,
      [c.orderId],
    );
    expect(await counters(c.tt)).toMatchObject({ reserved: 2, paid: 0 });
    expect(await ticketCount(c.orderId)).toBe(0);

    const first = await send(c, "payment.succeeded").call();
    expect(first.body.outcome).toBe("ALREADY_PAID");
    expect(await counters(c.tt)).toMatchObject({ reserved: 0, paid: 2 });
    expect(await ticketCount(c.orderId)).toBe(2);

    // A second replay must not convert or issue again.
    await send(c, "payment.succeeded").call();
    expect(await counters(c.tt)).toMatchObject({ reserved: 0, paid: 2 });
    expect(await ticketCount(c.orderId)).toBe(2);
  });

  it("is completed by the recovery job once the order is older than a minute", async () => {
    const c = await checkout({ qty: 1 });
    await execute(
      `UPDATE orders SET status='PAID'::order_status, paid_at=CURRENT_TIMESTAMP - INTERVAL '5 minutes', version=version+1 WHERE id=$1`,
      [c.orderId],
    );
    const { recoverPaidOrders } = await import("@/lib/server/payments");
    await recoverPaidOrders(100);
    expect(await counters(c.tt)).toMatchObject({ reserved: 0, paid: 1 });
    expect(await ticketCount(c.orderId)).toBe(1);
  });
});
