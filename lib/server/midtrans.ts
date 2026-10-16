import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/server/http";

import { allowQrImageUrl, midtransSimulatorUrl, type PaymentInstructions, type VaBank } from "@/lib/payment-methods";

/**
 * Midtrans adapter (Core API QRIS/VA + Snap e-wallet + status API). Sandbox only:
 * production credentials and production hosts are refused outright.
 */
const SANDBOX_SNAP_URL = "https://app.sandbox.midtrans.com/snap/v1/transactions";
const SANDBOX_API_BASE = "https://api.sandbox.midtrans.com/v2";
const PRODUCTION_SNAP_URL = "https://app.midtrans.com/snap/v1/transactions";
const PRODUCTION_API_BASE = "https://api.midtrans.com/v2";
const SANDBOX_KEY_PREFIX = "SB-Mid-server-";
const HTTP_TIMEOUT_MS = 10_000;
const CHARGE_RETRIES = 2;

export type PaymentProviderName = "sandbox" | "midtrans";

export function activePaymentProvider(): PaymentProviderName {
  const raw = String(process.env.PAYMENT_PROVIDER || "sandbox").trim().toLowerCase();
  if (raw === "sandbox" || raw === "midtrans") return raw;
  throw new AppError("SERVICE_UNHEALTHY", "Provider pembayaran tidak valid.", {}, 503);
}

export function classifyMidtransServerKey(
  raw: string,
): "sandbox-server" | "sandbox-client" | "production" | "production-client" | "missing" | "unrecognized" {
  const key = String(raw || "").trim();
  if (!key) return "missing";
  if (key.startsWith(SANDBOX_KEY_PREFIX)) return "sandbox-server";
  if (key.startsWith("SB-Mid-client-")) return "sandbox-client";
  if (key.startsWith("Mid-server-")) return "production";
  if (key.startsWith("Mid-client-")) return "production-client";
  return "unrecognized";
}

/** sandbox = uang uji. production = pembayaran pembeli sungguhan lewat Midtrans, hanya jika PAYMENT_ENV=production. */
export function midtransMode(): "sandbox" | "production" {
  const raw = String(process.env.PAYMENT_ENV || "sandbox").trim().toLowerCase();
  if (raw !== "sandbox" && raw !== "production") {
    throw new AppError("SERVICE_UNHEALTHY", "PAYMENT_ENV harus sandbox atau production.", {}, 503);
  }
  return raw;
}

export function midtransHosts(): { snap: string; api: string; charge: string } {
  const live = midtransMode() === "production";
  const api = live ? PRODUCTION_API_BASE : SANDBOX_API_BASE;
  return { snap: live ? PRODUCTION_SNAP_URL : SANDBOX_SNAP_URL, api, charge: `${api}/charge` };
}

export function midtransConfigured(): boolean {
  const kind = classifyMidtransServerKey(process.env.MIDTRANS_SERVER_KEY || "");
  return midtransMode() === "production" ? kind === "production" : kind === "sandbox-server";
}

export function requireMidtransKey(): void {
  serverKey();
}

function serverKey(): string {
  const key = String(process.env.MIDTRANS_SERVER_KEY || "").trim();
  const kind = classifyMidtransServerKey(key);
  if (kind === "missing") {
    throw new AppError("SERVICE_UNHEALTHY", "Pembayaran Midtrans belum dikonfigurasi. Isi MIDTRANS_SERVER_KEY dengan Server Key Sandbox.", {}, 503);
  }
  const mode = midtransMode();
  if (kind === "production" && mode !== "production") {
    throw new AppError(
      "SERVICE_UNHEALTHY",
      "Kunci Midtrans Production hanya dipakai bila PAYMENT_ENV=production pada server dengan WEB_ORIGIN https publik.",
      {},
      503,
    );
  }
  if (mode === "production" && kind !== "production") {
    throw new AppError(
      "SERVICE_UNHEALTHY",
      "PAYMENT_ENV=production membutuhkan Server Key Production (awalan Mid-server-), bukan kunci Sandbox.",
      {},
      503,
    );
  }
  if (kind === "sandbox-client" || kind === "production-client") {
    throw new AppError(
      "SERVICE_UNHEALTHY",
      "Itu Client Key. Isi MIDTRANS_SERVER_KEY dengan Server Key (SB-Mid-server- untuk uji, Mid-server- untuk pembayaran nyata).",
      {},
      503,
    );
  }
  if (mode === "sandbox" && kind !== "sandbox-server") {
    throw new AppError("SERVICE_UNHEALTHY", "Format MIDTRANS_SERVER_KEY tidak dikenali. Gunakan Server Key Sandbox berawalan SB-Mid-server-.", {}, 503);
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

export type MappedStatus =
  | "payment.succeeded"
  | "payment.pending"
  | "payment.failed"
  | "payment.expired"
  | "refund.completed"
  | "provider.recorded";

/** Maps Midtrans transaction/fraud status to our event types. */
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
    case "refund":
    case "partial_refund":
      return "refund.completed";
    default:
      return "provider.recorded";
  }
}

/** Bank transfer/VA cannot be reversed by Midtrans; QRIS and e-wallet can. */
export function midtransRefundApiSupported(method: string): boolean {
  const m = String(method || "").toUpperCase();
  return m === "QRIS" || m === "EWALLET";
}

export function parseMidtransRefundResponse(body: Record<string, unknown>, httpStatus: number): { ok: boolean; duplicate: boolean } {
  const code = String(body.status_code || httpStatus);
  if (code === "406") return { ok: true, duplicate: true };
  if (code === "200" || code === "201") return { ok: true, duplicate: false };
  return { ok: false, duplicate: false };
}

export async function createMidtransRefund(input: {
  orderId: string;
  amountRupiah: number;
  refundKey: string;
  reason: string;
}): Promise<{ ok: boolean; duplicate: boolean }> {
  const res = await midtransFetchRetry(`${midtransHosts().api}/${encodeURIComponent(input.orderId)}/refund`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: basicAuth(),
    },
    body: JSON.stringify({
      refund_key: input.refundKey.slice(0, 50),
      amount: input.amountRupiah,
      reason: input.reason.slice(0, 255),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseMidtransRefundResponse(body, res.status);
  if (!parsed.ok) {
    const msg = String(body.status_message || "Refund Midtrans belum dapat diproses. Coba lagi.").slice(0, 240);
    throw new AppError("SERVICE_UNHEALTHY", msg, {}, 502);
  }
  return parsed;
}

async function midtransFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS), cache: "no-store" });
  } catch {
    throw new AppError("SERVICE_UNHEALTHY", "Layanan pembayaran tidak dapat dihubungi.", {}, 503);
  }
}

async function midtransFetchRetry(url: string, init: RequestInit): Promise<Response> {
  let last: Response | undefined;
  for (let i = 0; i <= CHARGE_RETRIES; i++) {
    last = await midtransFetch(url, init);
    if (last.status < 500 || i === CHARGE_RETRIES) return last;
  }
  return last as Response;
}

function expiryBlock(minutes: number) {
  return { custom_expiry: { expiry_duration: Math.max(1, Math.floor(minutes)), unit: "minute" } };
}

export type ChargeLine = { id: string; name: string; price: number; quantity: number };

export function chargeCatalog(input: {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  amountRupiah: number;
  items?: ChargeLine[];
}): { customer_details: Record<string, string>; item_details: ChargeLine[] } {
  const first = (input.customerName || "Pembeli").trim().slice(0, 50) || "Pembeli";
  const email = input.customerEmail.includes("@") ? input.customerEmail.trim().slice(0, 100) : "";
  const phone = String(input.customerPhone || "").replace(/\D/g, "").slice(0, 15);
  const lines = (input.items || []).filter((l) => l.quantity > 0 && Number.isInteger(l.price) && l.price >= 0);
  const sum = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const item_details =
    sum === input.amountRupiah && lines.length
      ? lines.map((l) => ({
          id: String(l.id).slice(0, 50),
          name: String(l.name || "Tiket").slice(0, 50),
          price: l.price,
          quantity: l.quantity,
        }))
      : [{ id: "order", name: "Tiket", price: input.amountRupiah, quantity: 1 }];
  const customer_details: Record<string, string> = { first_name: first };
  if (email) customer_details.email = email;
  if (phone.length >= 10) customer_details.phone = phone;
  return { customer_details, item_details };
}

function pickQrImageUrl(actions: unknown): string | undefined {
  if (!Array.isArray(actions)) return undefined;
  const list = actions.filter((a) => a && typeof a === "object") as { name?: unknown; url?: unknown }[];
  const preferred = list.find((a) => a.name === "generate-qr-code-v2") || list.find((a) => a.name === "generate-qr-code");
  const url = typeof preferred?.url === "string" ? preferred.url.trim() : "";
  return url && allowQrImageUrl(url) ? url : undefined;
}

/** Status API omits `actions`; the simulator still accepts this Core API image URL. */
function qrisImageUrlFromTransactionId(transactionId: string): string | undefined {
  const id = transactionId.trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) return undefined;
  const url = `${midtransHosts().api}/qris/${id}/qr-code`;
  return allowQrImageUrl(url) ? url : undefined;
}

export function parseQrisCharge(body: Record<string, unknown>): PaymentInstructions | null {
  const qrString = typeof body.qr_string === "string" ? body.qr_string.trim() : "";
  const fromTxn = typeof body.transaction_id === "string" ? qrisImageUrlFromTransactionId(body.transaction_id) : undefined;
  const qrImageUrl = pickQrImageUrl(body.actions) || fromTxn;
  if (!qrString && !qrImageUrl) return null;
  return {
    kind: "QRIS",
    qrString: qrString || undefined,
    qrImageUrl,
    copyText: qrString,
    ...(midtransMode() === "production"
      ? { simulatorHint: "Bayar dengan aplikasi bank atau e-wallet yang mendukung QRIS. Tiket terbit setelah Midtrans mengonfirmasi." }
      : {
          simulatorHint:
            "Selesaikan pembayaran QRIS sesuai instruksi Midtrans, lalu tekan Cek status. Tiket terbit setelah pembayaran dikonfirmasi.",
        }),
  };
}

export function parseVaCharge(body: Record<string, unknown>, bank: VaBank): PaymentInstructions | null {
  const numbers = Array.isArray(body.va_numbers) ? body.va_numbers : [];
  const first = numbers.find((n) => n && typeof n === "object") as { bank?: unknown; va_number?: unknown } | undefined;
  const vaFromList = typeof first?.va_number === "string" ? first.va_number.trim() : "";
  const permata = typeof body.permata_va_number === "string" ? body.permata_va_number.trim() : "";
  const vaNumber = vaFromList || permata || undefined;
  const billerCode = typeof body.biller_code === "string" ? body.biller_code.trim() : undefined;
  const billKey = typeof body.bill_key === "string" ? body.bill_key.trim() : undefined;
  const copyText = vaNumber || billKey || "";
  if (!copyText) return null;
  return {
    kind: "VIRTUAL_ACCOUNT",
    bank,
    vaNumber,
    billerCode,
    billKey,
    copyText,
    ...(midtransMode() === "production"
      ? { simulatorHint: "Transfer tepat sesuai nominal ke nomor virtual account ini. Tiket terbit setelah Midtrans mengonfirmasi." }
      : {
          simulatorHint: "Transfer tepat sesuai nominal, lalu tekan Cek status. Tiket terbit setelah pembayaran dikonfirmasi.",
          simulatorUrl: midtransSimulatorUrl("VIRTUAL_ACCOUNT", bank),
        }),
  };
}

async function fetchChargeSnapshot(orderId: string): Promise<Record<string, unknown> | null> {
  const res = await midtransFetch(`${midtransHosts().api}/${encodeURIComponent(orderId)}/status`, {
    method: "GET",
    headers: { Accept: "application/json", Authorization: basicAuth() },
  });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || String(body.status_code) === "404") return null;
  return body;
}

async function postCharge(payload: Record<string, unknown>, idempotencyKey: string, orderId: string): Promise<Record<string, unknown>> {
  const res = await midtransFetchRetry(midtransHosts().charge, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: basicAuth(),
      "Idempotency-Key": idempotencyKey.slice(0, 64),
    },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const code = String(body.status_code || res.status);
  // order_id already taken: recover the existing pending QR/VA from the status API.
  if (code === "406") {
    const recovered = await fetchChargeSnapshot(orderId);
    if (recovered) return recovered;
    throw new AppError("PAYMENT_ORDER_INVALID", "Referensi pembayaran sudah dipakai.", {}, 409);
  }
  if (!res.ok && code !== "201" && code !== "200") {
    throw new AppError("SERVICE_UNHEALTHY", "Pembayaran Midtrans belum dapat dibuat. Coba lagi.", {}, 502);
  }
  return body;
}

export async function createQrisCharge(input: {
  orderId: string;
  amountRupiah: number;
  expiresInMinutes: number;
  idempotencyKey: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items?: ChargeLine[];
}): Promise<PaymentInstructions> {
  const body = await postCharge(
    {
      payment_type: "qris",
      transaction_details: { order_id: input.orderId, gross_amount: input.amountRupiah },
      qris: { acquirer: "gopay" },
      ...chargeCatalog(input),
    },
    input.idempotencyKey,
    input.orderId,
  );
  const parsed = parseQrisCharge(body);
  if (!parsed) throw new AppError("SERVICE_UNHEALTHY", "Instruksi QRIS tidak lengkap.", {}, 502);
  return parsed;
}

export async function createVaCharge(input: {
  orderId: string;
  amountRupiah: number;
  expiresInMinutes: number;
  bank: VaBank;
  idempotencyKey: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items?: ChargeLine[];
}): Promise<PaymentInstructions> {
  const bank = input.bank.toLowerCase();
  const catalog = chargeCatalog(input);
  const payload =
    input.bank === "MANDIRI"
      ? {
          payment_type: "echannel",
          transaction_details: { order_id: input.orderId, gross_amount: input.amountRupiah },
          echannel: { bill_info1: "Pembayaran:", bill_info2: "Tiket event" },
          ...catalog,
          ...expiryBlock(input.expiresInMinutes),
        }
      : {
          payment_type: "bank_transfer",
          transaction_details: { order_id: input.orderId, gross_amount: input.amountRupiah },
          bank_transfer: { bank },
          ...catalog,
        };
  const body = await postCharge(payload, input.idempotencyKey, input.orderId);
  const parsed = parseVaCharge(body, input.bank);
  if (!parsed) throw new AppError("SERVICE_UNHEALTHY", "Nomor virtual account tidak lengkap.", {}, 502);
  return parsed;
}

export async function createSnapTransaction(input: {
  orderId: string;
  amountRupiah: number;
  expiresInMinutes: number;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  finishUrl: string;
  enabledPayments?: string[];
}): Promise<{ token: string; redirectUrl: string }> {
  const res = await midtransFetchRetry(midtransHosts().snap, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: basicAuth() },
    body: JSON.stringify({
      transaction_details: { order_id: input.orderId, gross_amount: input.amountRupiah },
      expiry: { unit: "minutes", duration: Math.max(1, Math.floor(input.expiresInMinutes)) },
      customer_details: chargeCatalog({
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,
        amountRupiah: input.amountRupiah,
      }).customer_details,
      callbacks: { finish: input.finishUrl },
      ...(input.enabledPayments?.length ? { enabled_payments: input.enabledPayments } : {}),
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
  const res = await midtransFetch(`${midtransHosts().api}/${encodeURIComponent(orderId)}/status`, {
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
