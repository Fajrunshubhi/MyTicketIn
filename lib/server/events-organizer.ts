import { dummyCover } from "@/lib/server/catalog";
import { publicImageSrc } from "@/lib/server/gallery";
import { AppError, execute, newId, query } from "@/lib/server/http";

const EVENT_COLS = `id, organizer_profile_id, slug, title, description, category, venue_name, address_line, city, province,
  latitude, longitude, tags, timezone, starts_at::text, ends_at::text, terms, contact_email, contact_phone,
  status::text AS status, inventory_mode::text AS inventory_mode, submitted_at::text, moderation_reason,
  published_at::text, cancelled_at::text, completed_at::text, created_at::text, updated_at::text, version`;

export type OrgEvent = Record<string, unknown> & {
  id: string;
  organizer_profile_id: string;
  slug: string;
  title: string;
  status: string;
  inventory_mode: string;
  version: number;
  starts_at: string;
  ends_at: string;
  updated_at: string;
};

function slugify(title: string, suffix: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48)
    .replace(/^-|-$/g, "");
  return `${base || "event"}-${suffix}`.slice(0, 72);
}

export function eventDto(e: OrgEvent) {
  return {
    id: e.id,
    organizerProfileId: e.organizer_profile_id,
    slug: e.slug,
    title: e.title,
    description: e.description,
    category: e.category,
    venueName: e.venue_name,
    addressLine: e.address_line,
    city: e.city,
    province: e.province,
    latitude: e.latitude,
    longitude: e.longitude,
    tags: e.tags || [],
    galleryUrls: Array.isArray((e as { galleryUrls?: string[] }).galleryUrls)
      ? (e as { galleryUrls?: string[] }).galleryUrls
      : [],
    timezone: e.timezone,
    startsAt: new Date(String(e.starts_at)).toISOString(),
    endsAt: new Date(String(e.ends_at)).toISOString(),
    terms: e.terms,
    contactEmail: e.contact_email,
    contactPhone: e.contact_phone,
    status: e.status,
    inventoryMode: e.inventory_mode,
    version: e.version,
    updatedAt: new Date(String(e.updated_at)).toISOString(),
  };
}

export async function listOrganizerEvents(orgId: string, status: string, limit: number) {
  const st = status.trim().toUpperCase();
  const rows = await query<OrgEvent>(
    `SELECT ${EVENT_COLS} FROM events
     WHERE organizer_profile_id = $1 AND ($2 = '' OR status::text = $2)
     ORDER BY updated_at DESC, id DESC
     LIMIT $3`,
    [orgId, st, Math.min(Math.max(limit || 25, 1), 50)],
  );
  return attachGalleryUrls(rows);
}

async function attachGalleryUrls(events: OrgEvent[]): Promise<OrgEvent[]> {
  if (!events.length) return events;
  const ids = events.map((e) => e.id);
  const rows = await query<{ event_id: string; image_url: string }>(
    `SELECT event_id, image_url FROM event_gallery_images
     WHERE event_id = ANY($1::text[])
     ORDER BY sort_order ASC, id ASC`,
    [ids],
  );
  const byEvent = new Map<string, string[]>();
  for (const row of rows) {
    const list = byEvent.get(row.event_id) || [];
    const src = publicImageSrc(row.image_url, "");
    if (src) list.push(src);
    byEvent.set(row.event_id, list);
  }
  return events.map((e) => {
    const urls = byEvent.get(e.id) || [];
    return {
      ...e,
      galleryUrls: urls.length ? urls : [dummyCover(String(e.category || ""), String(e.title || ""))],
    };
  });
}

export async function getOwnedEvent(orgId: string, id: string): Promise<OrgEvent> {
  const rows = await query<OrgEvent>(`SELECT ${EVENT_COLS} FROM events WHERE id = $1 LIMIT 1`, [id]);
  const e = rows[0];
  if (!e || e.organizer_profile_id !== orgId) throw new AppError("NOT_FOUND", "Event tidak ditemukan.", {}, 404);
  return e;
}

export async function createEvent(orgId: string, body: Record<string, unknown>) {
  const input = normalizeEventInput(body);
  const id = newId();
  const slug = slugify(input.title, id.slice(0, 8));
  const rows = await query<OrgEvent>(
    `INSERT INTO events (
       id, organizer_profile_id, slug, title, description, category, venue_name, address_line, city, province,
       latitude, longitude, tags, timezone, starts_at, ends_at, terms, contact_email, contact_phone, status, inventory_mode,
       created_at, updated_at, version
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'DRAFT'::event_status,$20::inventory_mode,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1
     ) RETURNING ${EVENT_COLS}`,
    [
      id,
      orgId,
      slug,
      input.title,
      input.description,
      input.category,
      input.venueName,
      input.addressLine,
      input.city,
      input.province,
      input.latitude,
      input.longitude,
      input.tags,
      input.timezone,
      input.startsAt,
      input.endsAt,
      input.terms,
      input.contactEmail,
      input.contactPhone,
      input.inventoryMode,
    ],
  );
  const e = rows[0];
  if (!e) throw new AppError("INTERNAL_ERROR", "Terjadi kesalahan internal.", {}, 500);
  return e;
}

export function authoringMutable(status: string): boolean {
  return status === "DRAFT" || status === "REJECTED" || status === "NEEDS_CHANGES";
}

export function detailsEditable(status: string): boolean {
  return authoringMutable(status) || status === "PUBLISHED";
}

function parseInventoryMode(raw: string): string {
  if (raw === "GENERAL_ADMISSION" || raw === "ZONED" || raw === "RESERVED_SEATING") return raw;
  throw new AppError("INVENTORY_MODE_MISMATCH", "Mode inventori tidak valid.", {}, 400);
}

const PHONE_RE = /^\+?[0-9]{8,15}$/;
const TAG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TIMEZONES = new Set(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]);

function runeLen(s: string): number {
  return [...s].length;
}

function normalizeTags(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const tag = String(item || "")
      .trim()
      .toLowerCase()
      .replace(/_/g, "-")
      .replace(/\s+/g, "-");
    if (!tag || seen.has(tag)) continue;
    if (runeLen(tag) < 2 || runeLen(tag) > 32 || !TAG_RE.test(tag)) {
      throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", {
        tags: "Setiap tag 2–32 karakter (huruf, angka, tanda hubung), maksimal 8 tag.",
      });
    }
    seen.add(tag);
    out.push(tag);
    if (out.length > 8) {
      throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", {
        tags: "Setiap tag 2–32 karakter (huruf, angka, tanda hubung), maksimal 8 tag.",
      });
    }
  }
  return out;
}

export function normalizeEventInput(body: Record<string, unknown>) {
  const fieldErrors: Record<string, string> = {};
  const title = String(body.title || "").trim();
  if (runeLen(title) < 3 || runeLen(title) > 160) fieldErrors.title = "Judul wajib 3–160 karakter.";
  const description = String(body.description || "").trim();
  if (runeLen(description) < 20 || runeLen(description) > 10000) fieldErrors.description = "Deskripsi wajib 20–10.000 karakter.";
  const category = String(body.category || "").trim();
  if (runeLen(category) < 2 || runeLen(category) > 80) fieldErrors.category = "Kategori wajib 2–80 karakter.";
  const venueName = String(body.venueName || "").trim();
  if (runeLen(venueName) < 2 || runeLen(venueName) > 160) fieldErrors.venueName = "Nama venue wajib 2–160 karakter.";
  const addressLine = String(body.addressLine || "").trim();
  if (runeLen(addressLine) < 2 || runeLen(addressLine) > 500) fieldErrors.addressLine = "Alamat wajib 2–500 karakter.";
  const city = String(body.city || "").trim();
  if (runeLen(city) < 2 || runeLen(city) > 100) fieldErrors.city = "Kota wajib 2–100 karakter.";
  const province = String(body.province || "").trim();
  if (runeLen(province) < 2 || runeLen(province) > 100) fieldErrors.province = "Provinsi wajib 2–100 karakter.";
  const latitude = body.latitude == null || body.latitude === "" ? null : Number(body.latitude);
  const longitude = body.longitude == null || body.longitude === "" ? null : Number(body.longitude);
  if (latitude == null || longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    fieldErrors.latitude = "Koordinat lokasi wajib diisi.";
  } else if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    fieldErrors.latitude = "Koordinat tidak valid.";
  }
  let tags: string[] = [];
  try {
    tags = normalizeTags(body.tags);
  } catch (err) {
    if (err instanceof AppError) Object.assign(fieldErrors, err.fieldErrors);
    else throw err;
  }
  const timezone = String(body.timezone || "Asia/Jakarta").trim();
  if (!TIMEZONES.has(timezone)) fieldErrors.timezone = "Zona waktu harus Asia/Jakarta, Asia/Makassar, atau Asia/Jayapura.";
  const startsAt = String(body.startsAt || "");
  const endsAt = String(body.endsAt || "");
  const startDate = new Date(startsAt);
  const endDate = new Date(endsAt);
  if (!startsAt || !endsAt || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || !(startDate < endDate)) {
    fieldErrors.startsAt = "Waktu mulai harus sebelum waktu selesai.";
  }
  const terms = String(body.terms || "").trim();
  if (runeLen(terms) < 2 || runeLen(terms) > 5000) fieldErrors.terms = "Syarat wajib 2–5000 karakter.";
  const contactEmail = String(body.contactEmail || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    fieldErrors.contactEmail = "Email kontak tidak valid.";
  }
  const phoneRaw = String(body.contactPhone || "").trim();
  if (phoneRaw && !PHONE_RE.test(phoneRaw)) {
    fieldErrors.contactPhone = "Nomor telepon 8–15 digit, boleh diawali +.";
  }
  let inventoryMode = "GENERAL_ADMISSION";
  try {
    inventoryMode = parseInventoryMode(String(body.inventoryMode || "GENERAL_ADMISSION"));
  } catch (err) {
    if (err instanceof AppError) fieldErrors.inventoryMode = "Mode inventori tidak valid.";
    else throw err;
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", fieldErrors, 400);
  }
  return {
    title,
    description,
    category,
    venueName,
    addressLine,
    city,
    province,
    latitude,
    longitude,
    tags,
    timezone,
    startsAt: startDate.toISOString(),
    endsAt: endDate.toISOString(),
    terms,
    contactEmail,
    contactPhone: phoneRaw || null,
    inventoryMode,
  };
}

export function normalizeTicketInput(body: Record<string, unknown>, eventStartsAt: string) {
  const fieldErrors: Record<string, string> = {};
  const name = String(body.name || "").trim();
  if (runeLen(name) < 2 || runeLen(name) > 120) fieldErrors.name = "Nama jenis tiket wajib 2–120 karakter.";
  const description = String(body.description || "").trim();
  if (description && runeLen(description) > 1000) fieldErrors.description = "Deskripsi jenis tiket maksimal 1000 karakter.";
  const priceRupiah = Number(body.priceRupiah);
  if (!Number.isInteger(priceRupiah) || priceRupiah < 0 || priceRupiah > 1_000_000_000) {
    fieldErrors.priceRupiah = "Harga harus integer Rupiah 0–1.000.000.000.";
  }
  const quota = Number(body.quota);
  if (!Number.isInteger(quota) || quota <= 0) fieldErrors.quota = "Kuota harus bilangan bulat positif.";
  let maxPerAccount = Number(body.maxPerAccount);
  if (!Number.isInteger(maxPerAccount) || maxPerAccount < 1) {
    maxPerAccount = Number.isInteger(quota) && quota > 0 ? quota : 1;
  }
  const saleStart = new Date(String(body.saleStartsAt || ""));
  const saleEnd = new Date(String(body.saleEndsAt || ""));
  const eventStart = new Date(eventStartsAt);
  if (Number.isNaN(saleStart.getTime()) || Number.isNaN(saleEnd.getTime()) || !(saleStart < saleEnd)) {
    fieldErrors.saleStartsAt = "Selesai jual harus setelah mulai jual.";
  } else if (Number.isNaN(eventStart.getTime()) || saleEnd > eventStart) {
    fieldErrors.saleEndsAt = "Penjualan harus berakhir sebelum event dimulai.";
  }
  const sortOrder = Number(body.sortOrder || 0);
  if (!Number.isInteger(sortOrder) || sortOrder < 0) fieldErrors.sortOrder = "Urutan tidak boleh negatif.";
  if (Object.keys(fieldErrors).length > 0) {
    throw new AppError("TICKET_TYPE_INVALID", "Periksa kembali isian formulir.", fieldErrors, 400);
  }
  return {
    name,
    description,
    priceRupiah,
    quota,
    maxPerAccount,
    saleStartsAt: saleStart.toISOString(),
    saleEndsAt: saleEnd.toISOString(),
    sortOrder,
  };
}

export async function updateEvent(orgId: string, id: string, body: Record<string, unknown>, expectedVersion: number) {
  const e = await getOwnedEvent(orgId, id);
  const status = String(e.status);
  if (!detailsEditable(status)) {
    throw new AppError("EVENT_STATUS_INVALID", "Status event tidak memungkinkan suntingan.", {}, 409);
  }
  let mode = String(e.inventory_mode);
  const input = normalizeEventInput({
    title: body.title ?? e.title,
    description: body.description ?? e.description,
    category: body.category ?? e.category,
    venueName: body.venueName ?? e.venue_name,
    addressLine: body.addressLine ?? e.address_line,
    city: body.city ?? e.city,
    province: body.province ?? e.province,
    latitude: body.latitude ?? e.latitude,
    longitude: body.longitude ?? e.longitude,
    tags: body.tags ?? e.tags,
    timezone: body.timezone ?? e.timezone,
    startsAt: body.startsAt ?? e.starts_at,
    endsAt: body.endsAt ?? e.ends_at,
    terms: body.terms ?? e.terms,
    contactEmail: body.contactEmail ?? e.contact_email,
    contactPhone: body.contactPhone ?? e.contact_phone,
    inventoryMode: body.inventoryMode ?? e.inventory_mode,
  });
  if (status === "DRAFT") {
    mode = input.inventoryMode;
  } else if (input.inventoryMode !== String(e.inventory_mode)) {
    throw new AppError("INVENTORY_MODE_MISMATCH", "Mode inventori tidak dapat diubah setelah event bukan draf.", {}, 409);
  }
  const n = await execute(
    `UPDATE events SET title=$1, description=$2, category=$3, venue_name=$4, address_line=$5, city=$6, province=$7,
            latitude=$8, longitude=$9, tags=$10, timezone=$11, starts_at=$12, ends_at=$13, terms=$14,
            contact_email=$15, contact_phone=$16, inventory_mode=$17::inventory_mode,
            updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$18 AND version=$19`,
    [
      input.title,
      input.description,
      input.category,
      input.venueName,
      input.addressLine,
      input.city,
      input.province,
      input.latitude,
      input.longitude,
      input.tags,
      input.timezone,
      input.startsAt,
      input.endsAt,
      input.terms,
      input.contactEmail,
      input.contactPhone,
      mode,
      id,
      expectedVersion,
    ],
  );
  if (!n) throw new AppError("EVENT_VERSION_CONFLICT", "Data berubah.", {}, 409);
  return getOwnedEvent(orgId, id);
}

export async function deleteDraft(orgId: string, id: string, expectedVersion: number) {
  const e = await getOwnedEvent(orgId, id);
  if (String(e.status) !== "DRAFT") throw new AppError("EVENT_STATUS_INVALID", "Hanya draf yang dapat dihapus.", {}, 409);
  const n = await execute(`DELETE FROM events WHERE id=$1 AND organizer_profile_id=$2 AND version=$3 AND status='DRAFT'`, [
    id,
    orgId,
    expectedVersion,
  ]);
  if (!n) throw new AppError("EVENT_VERSION_CONFLICT", "Data berubah.", {}, 409);
}

export async function submitEvent(orgId: string, id: string, expectedVersion: number) {
  const e = await getOwnedEvent(orgId, id);
  if (!["DRAFT", "REJECTED"].includes(String(e.status))) {
    throw new AppError("EVENT_STATUS_INVALID", "Event tidak dapat diajukan.", {}, 409);
  }
  const types = await listTickets(id);
  if (types.length === 0) {
    throw new AppError("TICKET_TYPE_REQUIRED", "Minimal satu jenis tiket wajib sebelum pengajuan.", {}, 400);
  }
  const n = await execute(
    `UPDATE events SET status='PENDING_REVIEW'::event_status, submitted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$1 AND version=$2 AND status IN ('DRAFT','REJECTED')`,
    [id, expectedVersion],
  );
  if (!n) throw new AppError("EVENT_VERSION_CONFLICT", "Data berubah.", {}, 409);
  return getOwnedEvent(orgId, id);
}

export async function listTickets(eventId: string) {
  const { listTicketRows, ticketDto } = await import("@/lib/server/event-extras");
  const rows = await listTicketRows(eventId);
  return rows.map(ticketDto);
}

export async function addTicket(orgId: string, eventId: string, body: Record<string, unknown>) {
  const event = await getOwnedEvent(orgId, eventId);
  if (!authoringMutable(String(event.status))) {
    throw new AppError("EVENT_STATUS_INVALID", "Status event tidak memungkinkan suntingan.", {}, 409);
  }
  const input = normalizeTicketInput(body, String(event.starts_at));
  const id = newId();
  const rows = await query<Record<string, unknown>>(
    `INSERT INTO event_ticket_types (id, event_id, name, description, price_rupiah, quota, max_per_account, sale_starts_at, sale_ends_at, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, name, description, price_rupiah, quota, max_per_account, sale_starts_at::text, sale_ends_at::text,
               sort_order, reserved_quantity, paid_quantity, version, NULL::text AS sales_stopped_at`,
    [
      id,
      eventId,
      input.name,
      input.description || null,
      input.priceRupiah,
      input.quota,
      input.maxPerAccount,
      input.saleStartsAt,
      input.saleEndsAt,
      input.sortOrder,
    ],
  );
  const { ticketDto } = await import("@/lib/server/event-extras");
  if (!rows[0]) throw new AppError("INTERNAL_ERROR", "Terjadi kesalahan internal.", {}, 500);
  await execute(`UPDATE events SET updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=$1`, [eventId]);
  return ticketDto(rows[0]);
}

export async function listAdminEvents(status: string, limit: number) {
  const st = status.trim().toUpperCase() || "PENDING_REVIEW";
  return query<OrgEvent>(
    `SELECT ${EVENT_COLS} FROM events WHERE ($1 = '' OR status::text = $1) ORDER BY submitted_at ASC NULLS LAST, id ASC LIMIT $2`,
    [st, Math.min(Math.max(limit || 25, 1), 50)],
  );
}

export async function decideEvent(adminId: string, id: string, decision: string, reason: string, expectedVersion: number) {
  const rows = await query<OrgEvent>(`SELECT ${EVENT_COLS} FROM events WHERE id=$1 LIMIT 1`, [id]);
  const e = rows[0];
  if (!e) throw new AppError("NOT_FOUND", "Event tidak ditemukan.", {}, 404);
  if (String(e.status) !== "PENDING_REVIEW") {
    throw new AppError("EVENT_STATUS_INVALID", "Hanya event menunggu moderasi yang dapat diputuskan.", {}, 409);
  }
  const d = decision.trim().toUpperCase();
  let status = "";
  const reasonTrim = reason.trim();
  if (d === "APPROVE" || d === "PUBLISHED") status = "PUBLISHED";
  else if (d === "REJECT" || d === "REJECTED") {
    status = "REJECTED";
    if (reasonTrim.length < 10 || reasonTrim.length > 1000) {
      throw new AppError("VALIDATION_ERROR", "Alasan wajib 10–1000 karakter.", { reason: "Alasan wajib 10–1000 karakter." }, 400);
    }
  } else {
    throw new AppError("VALIDATION_ERROR", "Keputusan tidak valid.", {}, 400);
  }
  const n = await execute(
    `UPDATE events SET
        status = $1::event_status,
        moderation_reason = $2,
        decided_at = CURRENT_TIMESTAMP,
        decided_by_user_id = $3,
        published_at = CASE WHEN $6::boolean THEN CURRENT_TIMESTAMP ELSE published_at END,
        updated_at = CURRENT_TIMESTAMP,
        version = version + 1
     WHERE id = $4 AND version = $5 AND status = 'PENDING_REVIEW'`,
    [status, status === "REJECTED" ? reasonTrim : null, adminId, id, expectedVersion, status === "PUBLISHED"],
  );
  if (!n) throw new AppError("EVENT_VERSION_CONFLICT", "Data berubah.", {}, 409);
  const next = await query<OrgEvent>(`SELECT ${EVENT_COLS} FROM events WHERE id=$1 LIMIT 1`, [id]);
  if (!next[0]) throw new AppError("NOT_FOUND", "Event tidak ditemukan.", {}, 404);
  return next[0];
}

export async function markEventCancelled(eventId: string, actorId: string, reason: string, expectedVersion?: number) {
  const why = reason.trim();
  if (why.length < 10 || why.length > 1000) {
    throw new AppError("VALIDATION_ERROR", "Alasan wajib 10–1000 karakter.", { reason: "Alasan wajib 10–1000 karakter." }, 400);
  }
  const n = await execute(
    `UPDATE events SET
        status = 'CANCELLED'::event_status,
        cancelled_at = CURRENT_TIMESTAMP,
        cancelled_by_user_id = $1,
        cancellation_reason = $2,
        updated_at = CURRENT_TIMESTAMP,
        version = version + 1
     WHERE id = $3
       AND status IN ('PUBLISHED','PENDING_REVIEW','REJECTED')
       AND ($4::int IS NULL OR version = $4)`,
    [actorId, why, eventId, expectedVersion ?? null],
  );
  if (!n) throw new AppError("EVENT_STATUS_INVALID", "Event tidak dapat dibatalkan.", {}, 409);
}
