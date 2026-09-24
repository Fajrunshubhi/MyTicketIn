import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { AppError, execute, newId, query, randomToken, tokenHash } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";

function qrKeyMaterial(): string[] {
  const candidates = [
    process.env.QR_ENCRYPTION_KEYS,
    process.env.SESSION_SECRET,
    process.env.NEXTAUTH_SECRET,
    "dev-session-secret-minimum-32-chars!!",
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    const value = String(raw || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function hashKey(raw: string): Buffer {
  return createHash("sha256").update(raw).digest();
}

function qrKey(): Buffer {
  return hashKey(qrKeyMaterial()[0]);
}

export function encryptToken(raw: string): { hash: string; ciphertext: Buffer; nonce: Buffer; tag: Buffer } {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", qrKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { hash: tokenHash(raw), ciphertext, nonce, tag };
}

export function decryptToken(ciphertext: Buffer, nonce: Buffer, tag: Buffer): string {
  let last: unknown;
  for (const material of qrKeyMaterial()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", hashKey(material), nonce);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("TICKET_CRYPTO_FAILED");
}

export function asBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") {
    const hex = value.startsWith("\\x") ? value.slice(2) : value;
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) return Buffer.from(hex, "hex");
    return Buffer.from(value, "utf8");
  }
  if (value && typeof value === "object") {
    const rec = value as { data?: unknown };
    if (Array.isArray(rec.data)) return Buffer.from(rec.data as number[]);
    const keys = Object.keys(value as object);
    if (keys.length && keys.every((k) => /^\d+$/.test(k))) {
      const bytes = keys
        .map((k) => Number(k))
        .sort((a, b) => a - b)
        .map((k) => Number((value as Record<string, number>)[String(k)]));
      return Buffer.from(bytes);
    }
  }
  return Buffer.from([]);
}

function ticketView(row: Record<string, unknown>) {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    manualCode: row.manual_code,
    status: row.status,
    issuedAt: row.issued_at,
    usedAt: row.used_at || undefined,
    event: {
      id: row.event_id,
      slug: row.slug,
      title: row.title,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      timezone: row.timezone,
      venueName: row.venue_name,
      addressLine: row.address_line,
      city: row.city,
      province: row.province,
    },
    ticketType: {
      name: row.ticket_type_name,
      sectionName: row.section_name || undefined,
      seatLabel: row.seat_label || undefined,
    },
    order: { id: row.order_id, orderNumber: row.order_number },
    owner: { name: row.owner_name },
    holder: {
      fullName: String(row.holder_full_name || ""),
      email: String(row.holder_email || ""),
      phone: String(row.holder_phone || ""),
      identityNumber:
        String(row.holder_identity_number || "") === "0000000000000000"
          ? ""
          : String(row.holder_identity_number || ""),
    },
  };
}

export async function listTickets(user: AuthUser, status: string, limit: number) {
  const lim = Math.min(Math.max(limit || 20, 1), 50);
  const st = status.trim().toUpperCase();
  const rows = await query<Record<string, unknown>>(
    `SELECT t.id, t.ticket_number, t.manual_code, t.order_id, t.event_id, t.owner_user_id, t.ticket_type_name, t.section_name, t.seat_label,
            t.status::text AS status, t.issued_at::text, t.used_at::text,
            COALESCE(NULLIF(btrim(t.holder_full_name), ''), a.full_name, '') AS holder_full_name,
            COALESCE(NULLIF(btrim(t.holder_email), ''), a.email, '') AS holder_email,
            COALESCE(NULLIF(btrim(t.holder_phone), ''), a.phone, '') AS holder_phone,
            COALESCE(NULLIF(t.holder_identity_number, '0000000000000000'), a.identity_number, '') AS holder_identity_number,
            e.slug, e.title, e.starts_at::text, e.ends_at::text, e.timezone, e.venue_name, e.address_line, e.city, e.province,
            o.order_number, u.name AS owner_name
     FROM tickets t
     JOIN events e ON e.id = t.event_id
     JOIN orders o ON o.id = t.order_id
     JOIN users u ON u.id = t.owner_user_id
     LEFT JOIN order_attendees a ON a.order_item_id = t.order_item_id AND a.unit_sequence = t.unit_sequence
     WHERE t.owner_user_id=$1 AND ($2 = '' OR t.status::text = $2)
     ORDER BY t.issued_at DESC, t.id DESC LIMIT $3`,
    [user.id, st, lim],
  );
  return rows.map(ticketView);
}

export async function getTicket(user: AuthUser, id: string) {
  const rows = await query<Record<string, unknown>>(
    `SELECT t.id, t.ticket_number, t.manual_code, t.order_id, t.event_id, t.owner_user_id, t.ticket_type_name, t.section_name, t.seat_label,
            t.status::text AS status, t.issued_at::text, t.used_at::text,
            COALESCE(NULLIF(btrim(t.holder_full_name), ''), a.full_name, '') AS holder_full_name,
            COALESCE(NULLIF(btrim(t.holder_email), ''), a.email, '') AS holder_email,
            COALESCE(NULLIF(btrim(t.holder_phone), ''), a.phone, '') AS holder_phone,
            COALESCE(NULLIF(t.holder_identity_number, '0000000000000000'), a.identity_number, '') AS holder_identity_number,
            e.slug, e.title, e.starts_at::text, e.ends_at::text, e.timezone, e.venue_name, e.address_line, e.city, e.province,
            o.order_number, u.name AS owner_name
     FROM tickets t
     JOIN events e ON e.id = t.event_id
     JOIN orders o ON o.id = t.order_id
     JOIN users u ON u.id = t.owner_user_id
     LEFT JOIN order_attendees a ON a.order_item_id = t.order_item_id AND a.unit_sequence = t.unit_sequence
     WHERE t.id=$1 LIMIT 1`,
    [id],
  );
  const t = rows[0];
  if (!t) throw new AppError("NOT_FOUND", "Tiket tidak ditemukan.", {}, 404);
  if (String(t.owner_user_id) !== user.id && user.role !== "ADMIN") {
    throw new AppError("NOT_FOUND", "Tiket tidak ditemukan.", {}, 404);
  }
  return ticketView(t);
}

export async function ticketQrPayload(user: AuthUser, id: string): Promise<string> {
  const rows = await query<{
    owner_user_id: string;
    token_ciphertext: Buffer | string;
    token_nonce: Buffer | string;
    token_auth_tag: Buffer | string;
    status: string;
  }>(
    `SELECT owner_user_id, encode(token_ciphertext, 'hex') AS token_ciphertext, encode(token_nonce, 'hex') AS token_nonce,
            encode(token_auth_tag, 'hex') AS token_auth_tag, status::text AS status
     FROM tickets WHERE id=$1 LIMIT 1`,
    [id],
  );
  const t = rows[0];
  if (!t || (String(t.owner_user_id) !== user.id && user.role !== "ADMIN")) {
    throw new AppError("NOT_FOUND", "Tiket tidak ditemukan.", {}, 404);
  }
  if (t.status !== "UNUSED") {
    throw new AppError("TICKET_QR_UNAVAILABLE", "Kode QR tidak tersedia untuk tiket ini.", {}, 409);
  }
  const ct = asBuffer(t.token_ciphertext);
  const nonce = asBuffer(t.token_nonce);
  const tag = asBuffer(t.token_auth_tag);
  if (ct.length === 0 || nonce.length !== 12 || tag.length !== 16) {
    throw new AppError("TICKET_CRYPTO_FAILED", "Kode QR tidak dapat ditampilkan.", {}, 500);
  }
  try {
    return decryptToken(ct, nonce, tag);
  } catch {
    throw new AppError("TICKET_CRYPTO_FAILED", "Kode QR tidak dapat ditampilkan.", {}, 500);
  }
}

export async function issueTicketsForPaidOrder(orderId: string, buyer: AuthUser) {
  const existing = await query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM tickets WHERE order_id=$1`, [orderId]);
  if (Number(existing[0]?.n || 0) > 0) return;
  const order = await query<{ id: string; event_id: string; buyer_user_id: string }>(
    `SELECT id, event_id, buyer_user_id FROM orders WHERE id=$1 AND status='PAID' LIMIT 1`,
    [orderId],
  );
  const o = order[0];
  if (!o) return;
  const items = await query<{
    id: string;
    ticket_type_id: string;
    ticket_type_name: string;
    section_name: string | null;
    seat_label: string | null;
    event_seat_id: string | null;
    quantity: number;
  }>(
    `SELECT id, ticket_type_id, ticket_type_name, section_name, seat_label, event_seat_id, quantity FROM order_items WHERE order_id=$1`,
    [orderId],
  );
  const user = await query<{ name: string; email: string }>(`SELECT name, email FROM users WHERE id=$1`, [o.buyer_user_id]);
  let seqGlobal = 0;
  for (const it of items) {
    for (let seq = 1; seq <= Number(it.quantity); seq += 1) {
      seqGlobal += 1;
      const tid = newId();
      const raw = randomToken();
      const enc = encryptToken(raw);
      const number = `T${tid.slice(0, 10).toUpperCase()}`;
      const manual = tid.replace(/[^a-f0-9]/gi, "").slice(0, 16).padEnd(16, "0").toUpperCase();
      const attendee = await query<{ full_name: string; email: string; phone: string; identity_number: string }>(
        `SELECT full_name, email, phone, identity_number FROM order_attendees
         WHERE order_item_id=$1 AND unit_sequence=$2 LIMIT 1`,
        [it.id, seq],
      );
      const holderName = attendee[0]?.full_name || user[0]?.name || buyer.name;
      const holderEmail = (attendee[0]?.email || user[0]?.email || buyer.email || "").toLowerCase();
      const holderPhone = attendee[0]?.phone || "";
      const holderNik = attendee[0]?.identity_number || "0000000000000000";
      await query(
        `INSERT INTO tickets (
           id, ticket_number, manual_code, order_id, order_item_id, event_id, ticket_type_id, ticket_type_name, section_name, seat_label, event_seat_id,
           owner_user_id, holder_full_name, holder_email, holder_phone, holder_identity_number, unit_sequence, status,
           token_hash, token_ciphertext, token_nonce, token_auth_tag, token_key_version
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'UNUSED'::ticket_status,$18,$19,$20,$21,1
         )`,
        [
          tid,
          number,
          manual,
          orderId,
          it.id,
          o.event_id,
          it.ticket_type_id,
          it.ticket_type_name,
          it.section_name,
          it.seat_label,
          it.event_seat_id,
          o.buyer_user_id,
          holderName,
          holderEmail,
          holderPhone,
          holderNik,
          seq,
          enc.hash,
          enc.ciphertext,
          enc.nonce,
          enc.tag,
        ],
      );
    }
  }
}

export function normalizeManualCode(raw: string): string {
  return raw.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export async function lookupTicketByToken(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hash = tokenHash(trimmed);
  const manual = normalizeManualCode(trimmed);
  const rows = await query<Record<string, unknown>>(
    `SELECT t.id, t.event_id, t.owner_user_id, t.status::text AS status, t.ticket_number, t.ticket_type_name, t.section_name, t.seat_label, t.used_at::text,
            COALESCE(NULLIF(btrim(t.holder_full_name), ''), a.full_name, u.name, '') AS holder_full_name,
            COALESCE(NULLIF(btrim(t.holder_email), ''), a.email, u.email, '') AS holder_email,
            COALESCE(NULLIF(btrim(t.holder_phone), ''), a.phone, '') AS holder_phone,
            COALESCE(NULLIF(t.holder_identity_number, '0000000000000000'), a.identity_number, '') AS holder_identity_number,
            u.name AS owner_name
     FROM tickets t
     JOIN users u ON u.id = t.owner_user_id
     LEFT JOIN order_attendees a ON a.order_item_id = t.order_item_id AND a.unit_sequence = t.unit_sequence
     WHERE t.token_hash = $1
        OR ($2 <> '' AND char_length($2) = 16 AND btrim(t.manual_code) = $2)
        OR upper(btrim(t.ticket_number)) = upper($3)
     LIMIT 1`,
    [hash, manual, trimmed],
  );
  return rows[0] || null;
}

export async function markUsed(ticketId: string, operatorId: string) {
  const n = await execute(
    `UPDATE tickets SET status='USED'::ticket_status, used_at=CURRENT_TIMESTAMP, used_by_user_id=$2, updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$1 AND status='UNUSED'`,
    [ticketId, operatorId],
  );
  if (!n) throw new AppError("CHECK_IN_ALREADY_USED", "Tiket sudah digunakan.", {}, 409);
}
