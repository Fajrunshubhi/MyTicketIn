import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { AppError, newId, query } from "@/lib/server/http";
import { expireOrderById, failPendingOrder } from "@/lib/server/orders";
import { recoverPaidOrderById, settlePaidOrder } from "@/lib/server/payments";
import { completeSandboxRefund } from "@/lib/server/refunds";
import { hitRateLimit } from "@/lib/server/rate-limit";
import {
  fetchMidtransStatus,
  mapMidtransStatus,
  midtransConfigured,
  parseGrossAmount,
  parseMidtransNotification,
  verifyMidtransSignature,
  type MidtransNotification,
} from "@/lib/server/midtrans";

const MAX_BODY_BYTES = 256 * 1024;
const EVENT_TYPES = [
  "payment.succeeded",
  "payment.pending",
  "payment.failed",
  "payment.expired",
  "refund.completed",
  "provider.recorded",
] as const;
type EventType = (typeof EVENT_TYPES)[number];
type ProviderName = "sandbox" | "midtrans";

type WebhookPayload = {
  eventId: string;
  eventType: EventType;
  externalReference: string;
  amountRupiah: number;
  currency: string;
};

export type WebhookResult = {
  status: number;
  body: { received: true; replay?: boolean; outcome?: string };
};

export function signWebhookBody(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

function signatureMatches(
  secret: string,
  rawBody: string,
  signature: string,
): boolean {
  const expected = Buffer.from(signWebhookBody(secret, rawBody), "hex");
  const given = Buffer.from(
    String(signature || "")
      .trim()
      .toLowerCase(),
    "hex",
  );
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function parsePayload(rawBody: string): WebhookPayload {
  let data: unknown;
  try {
    data = JSON.parse(rawBody);
  } catch {
    throw new AppError(
      "VALIDATION_ERROR",
      "Payload webhook tidak valid.",
      {},
      400,
    );
  }
  const o = (data && typeof data === "object" ? data : {}) as Record<
    string,
    unknown
  >;
  const eventId = typeof o.eventId === "string" ? o.eventId.trim() : "";
  const ref =
    typeof o.externalReference === "string" ? o.externalReference.trim() : "";
  const amount = o.amountRupiah;
  if (
    !eventId ||
    eventId.length > 191 ||
    !ref ||
    ref.length > 191 ||
    !EVENT_TYPES.includes(o.eventType as EventType) ||
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    o.currency !== "IDR"
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Payload webhook tidak valid.",
      {},
      400,
    );
  }
  return {
    eventId,
    eventType: o.eventType as EventType,
    externalReference: ref,
    amountRupiah: amount,
    currency: "IDR",
  };
}

type Outcome = { status: "PROCESSED" | "FAILED"; reason: string; http: number };

async function openReconciliation(
  paymentId: string,
  orderId: string,
  webhookEventId: string,
  reason: "LATE_SUCCESS" | "AMOUNT_MISMATCH" | "ORDER_STATE_MISMATCH",
  providerAmount: number,
): Promise<void> {
  await query(
    `INSERT INTO payment_reconciliations (id, payment_id, order_id, webhook_event_id, reason_code, provider_amount_rupiah)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (webhook_event_id) DO NOTHING`,
    [newId(), paymentId, orderId, webhookEventId, reason, providerAmount],
  );
}

async function applyEvent(
  provider: ProviderName,
  eventRowId: string,
  p: WebhookPayload,
): Promise<Outcome> {
  if (p.eventType === "provider.recorded") {
    return { status: "PROCESSED", reason: "RECORDED", http: 200 };
  }
  if (p.eventType === "refund.completed") {
    const pay = await query<{ id: string }>(
      `SELECT id FROM payments WHERE provider=$2 AND external_reference=$1 LIMIT 1`,
      [p.externalReference, provider],
    );
    if (!pay[0]) return { status: "FAILED", reason: "UNKNOWN_REFERENCE", http: 202 };
    const open = await query<{ id: string }>(
      `SELECT id FROM refunds WHERE payment_id=$1 AND status IN ('APPROVED'::refund_status,'PROCESSING'::refund_status,'FAILED'::refund_status) ORDER BY created_at`,
      [pay[0].id],
    );
    for (const rf of open) {
      await completeSandboxRefund(rf.id);
    }
    return { status: "PROCESSED", reason: open.length ? "REFUND_COMPLETED" : "REFUND_EVENT_RECORDED", http: 200 };
  }
  const pay = await query<{
    id: string;
    order_id: string;
    amount_rupiah: number;
    status: string;
  }>(
    `SELECT id, order_id, amount_rupiah, status::text AS status FROM payments
     WHERE provider=$2 AND external_reference=$1 LIMIT 1`,
    [p.externalReference, provider],
  );
  const payment = pay[0];
  // Unknown reference may simply be early: keep FAILED so the provider's retry can succeed later.
  if (!payment)
    return { status: "FAILED", reason: "UNKNOWN_REFERENCE", http: 202 };

  if (Number(payment.amount_rupiah) !== p.amountRupiah) {
    await openReconciliation(
      payment.id,
      payment.order_id,
      eventRowId,
      "AMOUNT_MISMATCH",
      p.amountRupiah,
    );
    return { status: "PROCESSED", reason: "AMOUNT_MISMATCH", http: 200 };
  }

  if (p.eventType === "payment.pending") {
    // The provider acknowledged the attempt (e.g. a VA number was issued); the order stays PENDING until paid.
    await query(
      `UPDATE payments SET status='PENDING'::payment_status, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='CREATED'`,
      [payment.id],
    );
    return { status: "PROCESSED", reason: "PAYMENT_PENDING", http: 200 };
  }

  if (p.eventType === "payment.succeeded") {
    if (await settlePaidOrder(payment.order_id, payment.id)) {
      return { status: "PROCESSED", reason: "PAID", http: 200 };
    }
    await expireOrderById(payment.order_id); // no-op unless still PENDING past its window
    const o = await query<{ status: string }>(
      `SELECT status::text AS status FROM orders WHERE id=$1`,
      [payment.order_id],
    );
    const orderStatus = o[0]?.status;
    if (orderStatus === "PAID" || orderStatus === "REFUNDED") {
      // A retry may find the order PAID because an earlier attempt crashed after the status gate.
      if (orderStatus === "PAID") await recoverPaidOrderById(payment.order_id);
      return { status: "PROCESSED", reason: "ALREADY_PAID", http: 200 };
    }
    // Money arrived but the order can no longer be fulfilled: record it for manual reconciliation, issue nothing.
    await query(
      `UPDATE payments SET status='SUCCEEDED'::payment_status, succeeded_at=CURRENT_TIMESTAMP, failed_at=NULL, updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND status IN ('CREATED','PENDING','EXPIRED','FAILED')`,
      [payment.id],
    );
    const late = orderStatus === "EXPIRED" || orderStatus === "FAILED";
    await openReconciliation(
      payment.id,
      payment.order_id,
      eventRowId,
      late ? "LATE_SUCCESS" : "ORDER_STATE_MISMATCH",
      p.amountRupiah,
    );
    return {
      status: "PROCESSED",
      reason: late ? "LATE_SUCCESS" : "ORDER_STATE_MISMATCH",
      http: 200,
    };
  }

  // payment.failed / payment.expired: only a still-pending order is affected; late failures never undo a Paid order.
  const expired = p.eventType === "payment.expired";
  const changed = await failPendingOrder(
    payment.order_id,
    expired ? "EXPIRED" : "FAILED",
  );
  await query(
    `UPDATE payments SET status=$2::payment_status, failed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
     WHERE id=$1 AND status IN ('CREATED','PENDING')`,
    [payment.id, expired ? "EXPIRED" : "FAILED"],
  );
  if (!changed && provider === "midtrans") {
    // Midtrans can reverse a settled payment (e.g. deny after settlement). A Paid order is never undone
    // automatically, so surface it for manual reconciliation.
    const o = await query<{ status: string }>(
      `SELECT status::text AS status FROM orders WHERE id=$1`,
      [payment.order_id],
    );
    if (o[0]?.status === "PAID") {
      await openReconciliation(payment.id, payment.order_id, eventRowId, "ORDER_STATE_MISMATCH", p.amountRupiah);
      return { status: "PROCESSED", reason: "PAID_THEN_REVERSED", http: 200 };
    }
  }
  return {
    status: "PROCESSED",
    reason: changed ? "ORDER_CLOSED" : "ORDER_NOT_PENDING",
    http: 200,
  };
}

async function rejectInvalidSignature(provider: ProviderName, payloadHash: string): Promise<never> {
  // Audit the rejection without trusting any payload field.
  await query(
    `INSERT INTO payment_webhook_events (id, provider, external_event_id, payload_hash, signature_valid, processing_status, reason_code, processed_at, correlation_id)
     VALUES ($1,$5,$2,$3,false,'REJECTED','INVALID_SIGNATURE',CURRENT_TIMESTAMP,$4)
     ON CONFLICT (provider, external_event_id) DO NOTHING`,
    [
      newId(),
      `invalid_${payloadHash.slice(0, 32)}`,
      payloadHash,
      `wh:${payloadHash.slice(0, 16)}`,
      provider,
    ],
  );
  throw new AppError(
    "WEBHOOK_SIGNATURE_INVALID",
    "Signature webhook tidak valid.",
    {},
    401,
  );
}

/** Records the event once per (provider, event id) and applies it; every mutation inside is idempotent. */
async function recordAndApply(
  provider: ProviderName,
  payload: WebhookPayload,
  payloadHash: string,
  extra: Record<string, unknown> = {},
): Promise<WebhookResult> {
  const inserted = await query<{ id: string }>(
    `INSERT INTO payment_webhook_events (id, provider, external_event_id, external_reference, payload_hash, signature_valid,
                                         processing_status, correlation_id, sanitized_payload)
     VALUES ($1,$7,$2,$3,$4,true,'RECEIVED',$5,$6::jsonb)
     ON CONFLICT (provider, external_event_id) DO NOTHING RETURNING id`,
    [
      newId(),
      payload.eventId,
      payload.externalReference,
      payloadHash,
      `wh:${payloadHash.slice(0, 16)}`,
      JSON.stringify({
        eventType: payload.eventType,
        amountRupiah: payload.amountRupiah,
        currency: payload.currency,
        ...extra,
      }),
      provider,
    ],
  );
  let eventRowId = inserted[0]?.id;
  if (!eventRowId) {
    const existing = await query<{
      id: string;
      payload_hash: string;
      processing_status: string;
    }>(
      `SELECT id, payload_hash, processing_status::text AS processing_status FROM payment_webhook_events
       WHERE provider=$2 AND external_event_id=$1`,
      [payload.eventId, provider],
    );
    const row = existing[0];
    if (!row)
      throw new AppError(
        "INTERNAL_ERROR",
        "Webhook tidak dapat dicatat.",
        {},
        500,
      );
    if (row.payload_hash !== payloadHash) {
      throw new AppError(
        "WEBHOOK_PAYLOAD_MISMATCH",
        "Event ID sudah dipakai dengan payload berbeda.",
        {},
        409,
      );
    }
    if (
      row.processing_status === "PROCESSED" ||
      row.processing_status === "REJECTED"
    ) {
      return { status: 200, body: { received: true, replay: true } };
    }
    eventRowId = row.id; // RECEIVED/FAILED: retry processing; every mutation below is idempotent
  }

  const outcome = await applyEvent(provider, eventRowId, payload);
  await query(
    `UPDATE payment_webhook_events
     SET processing_status=$2::webhook_processing_status, reason_code=$3,
         processed_at = CASE WHEN $2 = 'PROCESSED' THEN CURRENT_TIMESTAMP ELSE NULL END
     WHERE id=$1`,
    [eventRowId, outcome.status, outcome.reason],
  );
  return {
    status: outcome.http,
    body: { received: true, outcome: outcome.reason },
  };
}

export async function handlePaymentWebhook(input: {
  provider: string;
  rawBody: string;
  signature: string;
  ip: string;
}): Promise<WebhookResult> {
  if (input.provider === "midtrans") return handleMidtransWebhook(input);
  if (input.provider !== "sandbox")
    throw new AppError("NOT_FOUND", "Provider tidak dikenal.", {}, 404);
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret)
    throw new AppError(
      "WEBHOOK_NOT_CONFIGURED",
      "Webhook pembayaran belum dikonfigurasi.",
      {},
      503,
    );
  await hitRateLimit("webhook-payments", input.ip, 120, 60);
  if (Buffer.byteLength(input.rawBody, "utf8") > MAX_BODY_BYTES) {
    throw new AppError("PAYLOAD_TOO_LARGE", "Payload terlalu besar.", {}, 413);
  }
  const payloadHash = createHash("sha256").update(input.rawBody).digest("hex");
  if (!signatureMatches(secret, input.rawBody, input.signature)) {
    return rejectInvalidSignature("sandbox", payloadHash);
  }
  return recordAndApply("sandbox", parsePayload(input.rawBody), payloadHash);
}

/**
 * Turns a Midtrans notification into a payload. For a known payment the status and amount are re-read from the
 * Midtrans status API, so a forged or stale notification cannot move money state on its own.
 */
async function midtransPayload(
  n: MidtransNotification,
  verifyWithApi: boolean,
): Promise<{ payload: WebhookPayload; hash: string; extra: Record<string, unknown> }> {
  const known = await query<{ id: string }>(
    `SELECT id FROM payments WHERE provider='midtrans' AND external_reference=$1 LIMIT 1`,
    [n.order_id],
  );
  let authoritative = n;
  if (known[0] && verifyWithApi) {
    const fetched = await fetchMidtransStatus(n.order_id);
    if (!fetched || fetched.order_id !== n.order_id) {
      throw new AppError("VALIDATION_ERROR", "Status pembayaran tidak cocok.", {}, 400);
    }
    authoritative = fetched;
  }
  const amount = parseGrossAmount(authoritative.gross_amount);
  const mapped = mapMidtransStatus(authoritative.transaction_status, authoritative.fraud_status);
  // The event id comes from the notification so provider retries dedupe regardless of what the API says now.
  const eventId = `${n.transaction_id || n.order_id}:${n.transaction_status}:${n.fraud_status || ""}`.slice(0, 191);
  const hash = createHash("sha256")
    .update(
      [n.order_id, n.status_code, n.gross_amount, n.transaction_status, n.fraud_status || "", n.transaction_id || ""].join("|"),
    )
    .digest("hex");
  return {
    payload: {
      eventId,
      // An unparseable amount becomes -1 so it can only produce an AMOUNT_MISMATCH, never a settlement.
      amountRupiah: amount ?? -1,
      eventType: mapped,
      externalReference: n.order_id,
      currency: "IDR",
    },
    hash,
    extra: {
      transactionStatus: authoritative.transaction_status,
      paymentType: authoritative.payment_type || "",
    },
  };
}

async function handleMidtransWebhook(input: {
  rawBody: string;
  ip: string;
}): Promise<WebhookResult> {
  if (!midtransConfigured())
    throw new AppError(
      "WEBHOOK_NOT_CONFIGURED",
      "Webhook pembayaran belum dikonfigurasi.",
      {},
      503,
    );
  await hitRateLimit("webhook-payments", input.ip, 120, 60);
  if (Buffer.byteLength(input.rawBody, "utf8") > MAX_BODY_BYTES) {
    throw new AppError("PAYLOAD_TOO_LARGE", "Payload terlalu besar.", {}, 413);
  }
  const rawHash = createHash("sha256").update(input.rawBody).digest("hex");
  const n = parseMidtransNotification(input.rawBody);
  if (!n)
    throw new AppError("VALIDATION_ERROR", "Payload webhook tidak valid.", {}, 400);
  if (!verifyMidtransSignature(n)) return rejectInvalidSignature("midtrans", rawHash);
  const { payload, hash, extra } = await midtransPayload(n, true);
  return recordAndApply("midtrans", payload, hash, extra);
}

/** Pull-based reconciliation for a Midtrans payment (buyer "cek status" or a lost notification). */
export async function refreshMidtransPayment(
  externalReference: string,
): Promise<WebhookResult | null> {
  const fetched = await fetchMidtransStatus(externalReference);
  if (!fetched) return null;
  const { payload, hash, extra } = await midtransPayload(fetched, false);
  return recordAndApply("midtrans", payload, hash, extra);
}
