import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/server/http";

/**
 * Midtrans adapter (Snap redirect + status API). Sandbox only: the MVP never accepts real money,
 * so production credentials and production hosts are refused outright.
 */
const SNAP_URL = "https://app.sandbox.midtrans.com/snap/v1/transactions";
const API_BASE = "https://api.sandbox.midtrans.com/v2";
const SANDBOX_KEY_PREFIX = "SB-Mid-server-";
const HTTP_TIMEOUT_MS = 10_000;

export type PaymentProviderName = "sandbox" | "midtrans";

export function activePaymentProvider(): PaymentProviderName {
  const raw = String(process.env.PAYMENT_PROVIDER || "sandbox").trim().toLowerCase();
  if (raw === "sandbox" || raw === "midtrans") return raw;
  throw new AppError("SERVICE_UNHEALTHY", "Provider pembayaran tidak valid.", {}, 503);
}

export function midtransConfigured(): boolean {
  return Boolean(String(process.env.MIDTRANS_SERVER_KEY || "").trim());
}

function serverKey(): string {
  const key = String(process.env.MIDTRANS_SERVER_KEY || "").trim();
  if (!key) throw new AppError("SERVICE_UNHEALTHY", "Pembayaran Midtrans belum dikonfigurasi.", {}, 503);
  if (!key.startsWith(SANDBOX_KEY_PREFIX)) {
    // A production key must never be usable here, even by mistake.
    throw new AppError("SERVICE_UNHEALTHY", "Hanya kunci Midtrans Sandbox yang diizinkan.", {}, 503);
  }
  return key;
}

function basicAuth(): string {
  return `Basic ${Buffer.from(`${serverKey()}:`).toString("base64")}`;
}

export function midtransSignature(orderId: string, statusCode: string, grossAmount: string, key: string): string {
  return createHash("sha512").update(`${orderId}${statusCode}${grossAmount}${key}`).digest("hex");
}

export function verifyMidtransSignature(n: MidtransNotification): boolean {
  const key = serverKey();
  const expected = Buffer.from(midtransSignature(n.order_id, n.status_code, n.gross_amount, key), "hex");
  const given = Buffer.from(String(n.signature_key || "").trim().toLowerCase(), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type MidtransNotification = {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_status: string;
  transaction_id?: string;
  fraud_status?: string;
  payment_type?: string;
  currency?: string;
};

/** Reads only the string fields we rely on; anything else in the body is ignored. */
export function parseMidtransNotification(rawBody: string): MidtransNotification | null {
  let data: unknown;
  try {
    data = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const n: MidtransNotification = {
    order_id: s(o.order_id),
    status_code: s(o.status_code),
    gross_amount: s(o.gross_amount),
    signature_key: s(o.signature_key),
    transaction_status: s(o.transaction_status),
    transaction_id: s(o.transaction_id),
    fraud_status: s(o.fraud_status),
    payment_type: s(o.payment_type),
    currency: s(o.currency),
  };
  if (!n.order_id || n.order_id.length > 50 || !n.status_code || !n.gross_amount || !n.transaction_status) return null;
  return n;
}

/** Midtrans sends "50000.00"; money stays integer Rupiah, so any real fraction is rejected. */
export function parseGrossAmount(value: string): number | null {
  const m = /^(\d{1,12})(?:\.0{1,2})?$/.exec(String(value || "").trim());
  return m ? Number(m[1]) : null;
}

export type MappedStatus = "payment.succeeded" | "payment.pending" | "payment.failed" | "payment.expired" | "provider.recorded";

/** Maps Midtrans transaction/fraud status to our event types; refunds and chargebacks are only recorded. */
export function mapMidtransStatus(transactionStatus: string, fraudStatus = ""): MappedStatus {
  const status = transactionStatus.toLowerCase();
  const fraud = fraudStatus.toLowerCase();
  switch (status) {
    case "settlement":
      return "payment.succeeded";
    case "capture":
      if (fraud === "deny") return "payment.failed";
      return fraud === "challenge" ? "payment.pending" : "payment.succeeded";
    case "pending":
    case "authorize":
      return "payment.pending";
    case "deny":
    case "cancel":
    case "failure":
      return "payment.failed";
    case "expire":
      return "payment.expired";
    default:
      return "provider.recorded";
  }
}

async function midtransFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS), cache: "no-store" });
  } catch {
    throw new AppError("SERVICE_UNHEALTHY", "Layanan pembayaran tidak dapat dihubungi.", {}, 503);
  }
}

export async function createSnapTransaction(input: {
  orderId: string;
  amountRupiah: number;
  expiresInMinutes: number;
  customerName: string;
  customerEmail: string;
  finishUrl: string;
}): Promise<{ token: string; redirectUrl: string }> {
  const res = await midtransFetch(SNAP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: basicAuth() },
    body: JSON.stringify({
      transaction_details: { order_id: input.orderId, gross_amount: input.amountRupiah },
      expiry: { unit: "minutes", duration: Math.max(1, Math.floor(input.expiresInMinutes)) },
      customer_details: { first_name: input.customerName.slice(0, 50), email: input.customerEmail },
      callbacks: { finish: input.finishUrl },
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { token?: string; redirect_url?: string };
  if (!res.ok || !body.token || !body.redirect_url) {
    throw new AppError("SERVICE_UNHEALTHY", "Pembayaran Midtrans belum dapat dibuat. Coba lagi.", {}, 502);
  }
  return { token: body.token, redirectUrl: body.redirect_url };
}

/** Authoritative status lookup; returns null when Midtrans does not know the order. */
export async function fetchMidtransStatus(orderId: string): Promise<MidtransNotification | null> {
  const res = await midtransFetch(`${API_BASE}/${encodeURIComponent(orderId)}/status`, {
    method: "GET",
    headers: { Accept: "application/json", Authorization: basicAuth() },
  });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) throw new AppError("SERVICE_UNHEALTHY", "Status pembayaran tidak dapat dibaca.", {}, 502);
  // Midtrans answers 200 with an embedded status_code of 404 for unknown orders.
  if (String(body.status_code) === "404") return null;
  if (!res.ok) throw new AppError("SERVICE_UNHEALTHY", "Status pembayaran tidak dapat dibaca.", {}, 502);
  return parseMidtransNotification(JSON.stringify(body));
}
