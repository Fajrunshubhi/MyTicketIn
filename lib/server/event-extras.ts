import { AppError, execute, newId, query } from "@/lib/server/http";
import { dummyCover } from "@/lib/event-cover";
import { publicImageSrc } from "@/lib/server/gallery";
import { detailsEditable, getOwnedEvent, markEventCancelled, normalizeTicketInput, type OrgEvent } from "@/lib/server/events-organizer";

function iso(v: unknown): string {
  return new Date(String(v)).toISOString();
}

export function ticketDto(t: Record<string, unknown>) {
  const quota = Number(t.quota || 0);
  const reserved = Number(t.reserved_quantity || 0);
  const paid = Number(t.paid_quantity || 0);
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? null,
    priceRupiah: Number(t.price_rupiah || 0),
    quota,
    remaining: Math.max(0, quota - reserved - paid),
    paidQuantity: paid,
    reservedQuantity: reserved,
    maxPerAccount: Number(t.max_per_account || 1),
    saleStartsAt: iso(t.sale_starts_at),
    saleEndsAt: iso(t.sale_ends_at),
    sortOrder: Number(t.sort_order || 0),
    version: Number(t.version || 1),
    salesStoppedAt: t.sales_stopped_at ? iso(t.sales_stopped_at) : null,
  };
}

export async function listTicketRows(eventId: string) {
  return query<Record<string, unknown>>(
    `SELECT id, name, description, price_rupiah, quota, max_per_account, sale_starts_at::text, sale_ends_at::text,
            sort_order, reserved_quantity, paid_quantity, version, sales_stopped_at::text
     FROM event_ticket_types WHERE event_id=$1 ORDER BY sort_order, id`,
    [eventId],
  );
}

export async function listSections(eventId: string) {
  const rows = await query<{ id: string; event_id: string; ticket_type_id: string; name: string; sort_order: number }>(
    `SELECT id, event_id, ticket_type_id, name, sort_order FROM venue_sections WHERE event_id=$1 ORDER BY sort_order, id`,
    [eventId],
  );
  return rows.map((r) => ({
    id: r.id,
    eventId: r.event_id,
    ticketTypeId: r.ticket_type_id,
    name: r.name,
    sortOrder: r.sort_order,
  }));
}

export async function listSeats(eventId: string) {
  const rows = await query<{ id: string; event_id: string; section_id: string; label: string }>(
    `SELECT id, event_id, section_id, label FROM event_seats WHERE event_id=$1 ORDER BY label, id`,
    [eventId],
  );
  return rows.map((r) => ({ id: r.id, eventId: r.event_id, sectionId: r.section_id, label: r.label }));
}

export async function getSeatMap(eventId: string) {
  const rows = await query<{ id: string; alt_text: string; legend: string; status: string }>(
    `SELECT id, alt_text, legend, status::text AS status FROM seat_map_assets WHERE event_id=$1 LIMIT 1`,
    [eventId],
  );
  const m = rows[0];
  if (!m) return null;
  return { id: m.id, altText: m.alt_text, legend: m.legend, status: m.status };
}

export async function listGalleryUrls(eventId: string, category = "", title = ""): Promise<string[]> {
  const fallback = dummyCover(category, title, eventId);
  const rows = await query<{ image_url: string }>(
    `SELECT image_url FROM event_gallery_images WHERE event_id=$1 ORDER BY sort_order, id`,
    [eventId],
  );
  const urls = rows.map((r) => publicImageSrc(r.image_url, fallback)).filter(Boolean);
  return urls.length ? urls : [fallback];
}

export async function replaceGalleryUrls(eventId: string, urls: string[]) {
  const clean = urls.map((u) => String(u || "").trim()).filter(Boolean).slice(0, 8);
  await execute(`DELETE FROM event_gallery_images WHERE event_id=$1`, [eventId]);
  for (let i = 0; i < clean.length; i++) {
    await execute(`INSERT INTO event_gallery_images (id, event_id, image_url, sort_order) VALUES ($1,$2,$3,$4)`, [
      newId(),
      eventId,
      clean[i],
      i,
    ]);
  }
}

export async function putSections(orgId: string, eventId: string, sections: { id?: string; ticketTypeId: string; name: string; sortOrder?: number }[], expectedVersion: number) {
  const e = await getOwnedEvent(orgId, eventId);
  if (e.version !== expectedVersion) throw new AppError("EVENT_VERSION_CONFLICT", "Data berubah.", {}, 409);
  await execute(`DELETE FROM event_seats WHERE event_id=$1`, [eventId]);
  await execute(`DELETE FROM venue_sections WHERE event_id=$1`, [eventId]);
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const name = String(s.name || "").trim();
    if (!name) continue;
    await execute(
      `INSERT INTO venue_sections (id, event_id, ticket_type_id, name, sort_order) VALUES ($1,$2,$3,$4,$5)`,
      [s.id?.trim() || newId(), eventId, s.ticketTypeId, name, Number(s.sortOrder ?? i)],
    );
  }
  await execute(`UPDATE events SET updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=$1`, [eventId]);
}

export async function putSeats(orgId: string, eventId: string, seats: { sectionId: string; label: string }[], expectedVersion: number) {
  const e = await getOwnedEvent(orgId, eventId);
  if (e.version !== expectedVersion) throw new AppError("EVENT_VERSION_CONFLICT", "Data berubah.", {}, 409);
  await execute(`DELETE FROM event_seats WHERE event_id=$1`, [eventId]);
  for (const seat of seats) {
    const label = String(seat.label || "").trim();
    if (!label) continue;
    await execute(`INSERT INTO event_seats (id, event_id, section_id, label) VALUES ($1,$2,$3,$4)`, [
      newId(),
      eventId,
      seat.sectionId,
      label,
    ]);
  }
  await execute(`UPDATE events SET updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=$1`, [eventId]);
}

export async function saveSeatMap(orgId: string, eventId: string, altText: string, legend: string, expectedVersion: number) {
  const e = await getOwnedEvent(orgId, eventId);
  if (e.version !== expectedVersion) throw new AppError("EVENT_VERSION_CONFLICT", "Data berubah.", {}, 409);
  const alt = altText.trim();
  const leg = legend.trim();
  if (alt.length < 3 || leg.length < 3) throw new AppError("VALIDATION_ERROR", "Teks alternatif dan legenda wajib diisi.", {}, 400);
  const existing = await getSeatMap(eventId);
  if (existing) {
    await execute(`UPDATE seat_map_assets SET alt_text=$1, legend=$2, status='READY'::image_asset_status WHERE event_id=$3`, [alt, leg, eventId]);
  } else {
    await execute(
      `INSERT INTO seat_map_assets (id, event_id, storage_key, mime_type, byte_size, alt_text, legend, status)
       VALUES ($1,$2,$3,'image/png',1,$4,$5,'READY'::image_asset_status)`,
      [newId(), eventId, `seat-map/${eventId}.png`, alt, leg],
    );
  }
  await execute(`UPDATE events SET updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=$1`, [eventId]);
}

export async function updateTicket(orgId: string, eventId: string, ticketId: string, body: Record<string, unknown>) {
  const event = await getOwnedEvent(orgId, eventId);
  if (!detailsEditable(String(event.status))) {
    throw new AppError("EVENT_STATUS_INVALID", "Status event tidak memungkinkan suntingan.", {}, 409);
  }
  const input = normalizeTicketInput(body, String(event.starts_at));
  const expected = Number(body.expectedVersion || 0);
  const n = await execute(
    `UPDATE event_ticket_types SET name=$1, description=$2, price_rupiah=$3, quota=$4, max_per_account=$5,
            sale_starts_at=$6, sale_ends_at=$7, sort_order=$8, updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$9 AND event_id=$10 AND version=$11`,
    [
      input.name,
      input.description || null,
      input.priceRupiah,
      input.quota,
      input.maxPerAccount,
      input.saleStartsAt,
      input.saleEndsAt,
      input.sortOrder,
      ticketId,
      eventId,
      expected,
    ],
  );
  if (!n) throw new AppError("EVENT_VERSION_CONFLICT", "Data berubah.", {}, 409);
  const rows = await listTicketRows(eventId);
  const t = rows.find((r) => r.id === ticketId);
  if (!t) throw new AppError("NOT_FOUND", "Tiket tidak ditemukan.", {}, 404);
  return ticketDto(t);
}

export async function completeEvent(orgId: string, eventId: string, expectedVersion: number) {
  const e = await getOwnedEvent(orgId, eventId);
  if (e.status !== "PUBLISHED") throw new AppError("EVENT_STATUS_INVALID", "Hanya event terbit yang dapat diselesaikan.", {}, 409);
  const n = await execute(
    `UPDATE events SET status='COMPLETED'::event_status, completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$1 AND version=$2 AND status='PUBLISHED'`,
    [eventId, expectedVersion],
  );
  if (!n) throw new AppError("EVENT_VERSION_CONFLICT", "Data berubah.", {}, 409);
  return getOwnedEvent(orgId, eventId);
}

export async function cancelEventByAdmin(eventId: string, reason: string, expectedVersion: number, actorId: string): Promise<OrgEvent> {
  await markEventCancelled(eventId, actorId, reason, expectedVersion);
  const rows = await query<OrgEvent>(
    `SELECT id, organizer_profile_id, slug, title, description, category, venue_name, address_line, city, province,
            latitude, longitude, tags, timezone, starts_at::text, ends_at::text, terms, contact_email, contact_phone,
            status::text AS status, inventory_mode::text AS inventory_mode, submitted_at::text, moderation_reason,
            published_at::text, cancelled_at::text, completed_at::text, created_at::text, updated_at::text, version
     FROM events WHERE id=$1`,
    [eventId],
  );
  if (!rows[0]) throw new AppError("NOT_FOUND", "Event tidak ditemukan.", {}, 404);
  return rows[0];
}

export async function createImageIntent(orgId: string, eventId: string, body: Record<string, unknown>) {
  await getOwnedEvent(orgId, eventId);
  const id = newId();
  await execute(
    `INSERT INTO event_image_assets (id, event_id, storage_key, original_name, mime_type, byte_size, alt_text, status, is_primary)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING_UPLOAD'::image_asset_status, TRUE)`,
    [
      id,
      eventId,
      `events/${eventId}/${id}`,
      String(body.fileName || "poster.png"),
      String(body.mimeType || "image/png"),
      Number(body.byteSize || 0),
      String(body.altText || "Gambar event"),
    ],
  );
  return { id, status: "PENDING_UPLOAD", uploadUrl: null };
}
