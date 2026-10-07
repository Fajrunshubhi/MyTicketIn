import { randomBytes } from "crypto";
import { execute, newId, query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";

export const tag = () => randomBytes(4).toString("hex");

export async function seedUser(label: string, role: "USER" | "ADMIN" = "USER"): Promise<AuthUser> {
  const id = newId();
  const t = tag();
  const username = `it_${label}_${t}`.toLowerCase().slice(0, 40);
  const email = `${username}@example.test`;
  await execute(
    `INSERT INTO users (id, name, username, email, role, status) VALUES ($1,$2,$3,$4,$5::user_role,'ACTIVE'::user_status)`,
    [id, `IT ${label}`, username, email, role],
  );
  return { id, name: `IT ${label}`, username, email, role, status: "ACTIVE", authVersion: 0 };
}

export async function seedOrganizer(owner: AuthUser) {
  const id = newId();
  await execute(
    `INSERT INTO organizer_profiles (id, owner_user_id, name, contact_email, description, status, decision_reason, decided_at, decided_by_user_id)
     VALUES ($1,$2,$3,$4,$5,'APPROVED'::organizer_status,'Integration test',CURRENT_TIMESTAMP,$2)`,
    [id, owner.id, `IT Org ${tag()}`, owner.email, "Organizer untuk integration test otomatis."],
  );
  return id;
}

export async function seedEvent(organizerProfileId: string, ownerId: string, mode: "GENERAL_ADMISSION" | "RESERVED_SEATING") {
  const id = newId();
  const slug = `it-event-${tag()}-${tag()}`;
  await execute(
    `INSERT INTO events (
       id, organizer_profile_id, slug, title, description, category, venue_name, address_line, city, province, timezone,
       starts_at, ends_at, terms, contact_email, status, inventory_mode, submitted_at, decided_at, decided_by_user_id, published_at
     ) VALUES (
       $1,$2,$3,$4,$5,'Musik','Venue Uji','Jl. Uji 1','Jakarta','DKI Jakarta','Asia/Jakarta',
       CURRENT_TIMESTAMP + INTERVAL '30 days', CURRENT_TIMESTAMP + INTERVAL '30 days 3 hours', 'Syarat uji.', 'it@example.test',
       'PUBLISHED'::event_status, $6::inventory_mode, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $7, CURRENT_TIMESTAMP
     )`,
    [id, organizerProfileId, slug, `IT Event ${tag()}`, "Deskripsi event uji integrasi otomatis. ".repeat(3), mode, ownerId],
  );
  return id;
}

export async function seedTicketType(eventId: string, quota: number, price = 50000) {
  const id = newId();
  await execute(
    `INSERT INTO event_ticket_types (id, event_id, name, price_rupiah, quota, sale_starts_at, sale_ends_at)
     VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP - INTERVAL '1 day',CURRENT_TIMESTAMP + INTERVAL '20 days')`,
    [id, eventId, `Tiket ${tag()}`, price, quota],
  );
  return id;
}

export async function seedSeat(eventId: string, ticketTypeId: string, label: string) {
  const sectionId = newId();
  await execute(`INSERT INTO venue_sections (id, event_id, ticket_type_id, name) VALUES ($1,$2,$3,'Zona A')`, [sectionId, eventId, ticketTypeId]);
  const seatId = newId();
  await execute(`INSERT INTO event_seats (id, event_id, section_id, label) VALUES ($1,$2,$3,$4)`, [seatId, eventId, sectionId, label]);
  return seatId;
}

export const idem = () => `it-${randomBytes(12).toString("hex")}`;

export async function counters(ticketTypeId: string) {
  const r = await query<{ reserved_quantity: number; paid_quantity: number; quota: number }>(
    `SELECT reserved_quantity, paid_quantity, quota FROM event_ticket_types WHERE id=$1`,
    [ticketTypeId],
  );
  return { reserved: Number(r[0].reserved_quantity), paid: Number(r[0].paid_quantity), quota: Number(r[0].quota) };
}
