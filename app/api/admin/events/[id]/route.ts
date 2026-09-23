import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/guard";
import { eventDto, listTickets } from "@/lib/server/events-organizer";
import { query } from "@/lib/server/http";
import { AppError } from "@/lib/server/http";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin(req);
    const rows = await query<Record<string, unknown> & { id: string; status: string; version: number; organizer_profile_id: string; slug: string; title: string; inventory_mode: string; starts_at: string; ends_at: string; updated_at: string }>(
      `SELECT id, organizer_profile_id, slug, title, description, category, venue_name, address_line, city, province,
              latitude, longitude, tags, timezone, starts_at::text, ends_at::text, terms, contact_email, contact_phone,
              status::text AS status, inventory_mode::text AS inventory_mode, updated_at::text, version
       FROM events WHERE id=$1 LIMIT 1`,
      [params.id],
    );
    if (!rows[0]) throw new AppError("NOT_FOUND", "Event tidak ditemukan.", {}, 404);
    const types = await listTickets(params.id);
    return jsonData({ event: eventDto(rows[0]), ticketTypes: types, version: rows[0].version }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
