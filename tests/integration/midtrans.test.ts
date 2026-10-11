import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import { createOrder } from "@/lib/server/orders";
import { createPayment, refreshPayment, sandboxSettle } from "@/lib/server/payments";
import { handlePaymentWebhook } from "@/lib/server/payment-webhook";
import { midtransSignature } from "@/lib/server/midtrans";
import { idem, seedEvent, seedOrganizer, seedTicketType, seedUser, tag } from "./helpers";

const KEY = "SB-Mid-server-integration-test";
const realFetch = globalThis.fetch;
const savedEnv = { ...process.env };

// Midtrans answers per order id; the database driver keeps using the real fetch.
const statusByOrder = new Map<string, Record<string, string>>();
let snapCalls = 0;

function installMidtransStub() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://app.sandbox.midtrans.com/snap/v1/transactions")) {
      snapCalls += 1;
      return new Response(
        JSON.stringify({ token: `tok-${snapCalls}`, redirect_url: `https://app.sandbox.midtrans.com/snap/v4/redirection/tok-${snapCalls}` }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }
    const m = /^https:\/\/api\.sandbox\.midtrans\.com\/v2\/([^/]+)\/status$/.exec(url);
    if (m) {
      const body = statusByOrder.get(decodeURIComponent(m[1]));
      return new Response(JSON.stringify(body || { status_code: "404", status_message: "not found" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
}

let organizer: AuthUser;
let orgProfileId: string;

beforeAll(async () => {
  process.env.PAYMENT_PROVIDER = "midtrans";
  process.env.MIDTRANS_SERVER_KEY = KEY;
  installMidtransStub();
  organizer = await seedUser("mtorg");
  orgProfileId = await seedOrganizer(organizer);
});

afterAll(() => {
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
});

afterEach(() => statusByOrder.clear());

async function checkout() {
  const buyer = await seedUser("mtbuyer");
  const eventId = await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION");
  const tt = await seedTicketType(eventId, 10, 50000);
  const { view } = await createOrder(buyer, { eventId, items: [{ ticketTypeId: tt, quantity: 2 }], confirmed: true }, idem());
  const orderId = String(view.id);
  const { payment } = await createPayment(buyer, orderId, "QRIS");
  return { buyer, orderId, ref: String(payment.externalReference), amount: Number(payment.amountRupiah), payment };
}

function notification(c: { ref: string; amount: number }, status: string, over: Record<string, string> = {}) {
  const gross = `${c.amount}.00`;
  const n: Record<string, string> = {
    order_id: c.ref,
    status_code: status === "pending" ? "201" : "200",
    gross_amount: gross,
    transaction_status: status,
    transaction_id: `tx-${tag()}`,
    fraud_status: "accept",
    payment_type: "bank_transfer",
    ...over,
  };
  n.signature_key = over.signature_key ?? midtransSignature(n.order_id, n.status_code, n.gross_amount, KEY);
  return n;
}

const send = (n: Record<string, string>, ip = "10.1.0.1") =>
  handlePaymentWebhook({ provider: "midtrans", rawBody: JSON.stringify(n), signature: "", ip });

const orderStatus = async (id: string) =>
  (await query<{ status: string }>(`SELECT status::text AS status FROM orders WHERE id=$1`, [id]))[0].status;
const ticketCount = async (id: string) =>
  Number((await query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM tickets WHERE order_id=$1`, [id]))[0].n);
const paymentStatus = async (orderId: string) =>
  (await query<{ status: string }>(`SELECT status::text AS status FROM payments WHERE order_id=$1`, [orderId]))[0].status;

describe("Midtrans Sandbox payments", () => {
  it("creates a Snap redirect once and replays it without calling Midtrans again", async () => {
    const before = snapCalls;
    const c = await checkout();
    expect(c.payment.provider).toBe("midtrans");
    expect(c.payment.redirectUrl).toContain("app.sandbox.midtrans.com/snap");
    expect(c.ref.length).toBeLessThanOrEqual(50);
    expect(snapCalls).toBe(before + 1);
    const again = await createPayment(c.buyer, c.orderId, "QRIS");
    expect(again.replay).toBe(true);
    expect(snapCalls).toBe(before + 1);
  });

  it("rejects a forged signature with 401 and changes nothing", async () => {
    const c = await checkout();
    await expect(send(notification(c, "settlement", { signature_key: "ab".repeat(64) }))).rejects.toMatchObject({
      status: 401,
    });
    expect(await orderStatus(c.orderId)).toBe("PENDING");
  });

  it("settles from the API-confirmed status, issues tickets once, and treats a retry as replay", async () => {
    const c = await checkout();
    const n = notification(c, "settlement");
    statusByOrder.set(c.ref, { ...n });
    const first = await send(n);
    expect(first.body.outcome).toBe("PAID");
    const retry = await send(n);
    expect(retry.body.replay).toBe(true);
    expect(await orderStatus(c.orderId)).toBe("PAID");
    expect(await ticketCount(c.orderId)).toBe(2);
  });

  it("does not trust a signed notification the status API contradicts", async () => {
    const c = await checkout();
    const n = notification(c, "settlement");
    statusByOrder.set(c.ref, { ...n, transaction_status: "pending", status_code: "201" });
    const res = await send(n);
    expect(res.body.outcome).toBe("PAYMENT_PENDING");
    expect(await orderStatus(c.orderId)).toBe("PENDING");
    expect(await paymentStatus(c.orderId)).toBe("PENDING");
  });

  it("opens a reconciliation instead of settling on an amount mismatch", async () => {
    const c = await checkout();
    const n = notification({ ref: c.ref, amount: c.amount - 1000 }, "settlement");
    statusByOrder.set(c.ref, { ...n });
    const res = await send(n);
    expect(res.body.outcome).toBe("AMOUNT_MISMATCH");
    expect(await orderStatus(c.orderId)).toBe("PENDING");
  });

  it("closes a pending order on expire and releases stock", async () => {
    const c = await checkout();
    const n = notification(c, "expire", { status_code: "407" });
    statusByOrder.set(c.ref, { ...n });
    const res = await send(n);
    expect(res.body.outcome).toBe("ORDER_CLOSED");
    expect(await orderStatus(c.orderId)).toBe("EXPIRED");
  });

  it("never undoes a Paid order on a later deny, but flags it for reconciliation", async () => {
    const c = await checkout();
    const ok = notification(c, "settlement");
    statusByOrder.set(c.ref, { ...ok });
    await send(ok);
    const deny = notification(c, "deny", { status_code: "202" });
    statusByOrder.set(c.ref, { ...deny });
    const res = await send(deny);
    expect(res.body.outcome).toBe("PAID_THEN_REVERSED");
    expect(await orderStatus(c.orderId)).toBe("PAID");
    expect(await ticketCount(c.orderId)).toBe(2);
    const rec = await query<{ reason_code: string }>(
      `SELECT reason_code FROM payment_reconciliations WHERE order_id=$1`,
      [c.orderId],
    );
    expect(rec.map((r) => r.reason_code)).toContain("ORDER_STATE_MISMATCH");
  });

  it("recovers a lost notification through refreshPayment", async () => {
    const c = await checkout();
    statusByOrder.set(c.ref, { ...notification(c, "settlement") });
    const out = await refreshPayment(c.buyer, c.orderId);
    expect(out.status).toBe("SUCCEEDED");
    expect(await orderStatus(c.orderId)).toBe("PAID");
    expect(await ticketCount(c.orderId)).toBe(2);
  });

  it("does not allow the sandbox simulator to settle a Midtrans payment", async () => {
    const c = await checkout();
    await expect(sandboxSettle(c.buyer, c.orderId)).rejects.toMatchObject({ status: 403 });
    expect(await orderStatus(c.orderId)).toBe("PENDING");
  });
});
