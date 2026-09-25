import { AppError, execute, newId, query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import { emptyRatingSummary, type RatingSummary } from "@/lib/reviews-format";

export type { RatingSummary } from "@/lib/reviews-format";
export { emptyRatingSummary, formatEventRating } from "@/lib/reviews-format";

export type EventReview = {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  authorName: string;
  eventTitle: string;
  eventSlug: string;
  organizerName: string;
  eventRatingAverage: number;
  eventRatingCount: number;
};

export function normalizeReviewInput(body: Record<string, unknown>): { rating: number; comment: string } {
  const rating = Number(body.rating);
  const comment = String(body.comment || "").trim().replace(/\s+/g, " ");
  const fields: Record<string, string> = {};
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) fields.rating = "Rating wajib 1 sampai 5 bintang.";
  const len = [...comment].length;
  if (len < 10 || len > 500) fields.comment = "Komentar wajib 10–500 karakter.";
  if (Object.keys(fields).length) throw new AppError("VALIDATION_ERROR", "Periksa kembali isian formulir.", fields, 400);
  return { rating, comment };
}

export async function ratingSummaryByEventIds(eventIds: string[]): Promise<Map<string, RatingSummary>> {
  const out = new Map<string, RatingSummary>();
  if (!eventIds.length) return out;
  const rows = await query<{ event_id: string; n: string; avg: string }>(
    `SELECT event_id, COUNT(*)::text AS n, ROUND(AVG(rating)::numeric, 1)::text AS avg
     FROM event_reviews WHERE event_id = ANY($1::text[]) GROUP BY event_id`,
    [eventIds],
  );
  for (const row of rows) {
    out.set(row.event_id, { count: Number(row.n || 0), average: Number(row.avg || 0) });
  }
  return out;
}

export async function ratingSummaryBySlug(slug: string): Promise<RatingSummary> {
  const rows = await query<{ n: string; avg: string }>(
    `SELECT COUNT(r.id)::text AS n, COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0)::text AS avg
     FROM events e
     LEFT JOIN event_reviews r ON r.event_id = e.id
     WHERE e.slug = $1`,
    [slug.trim().toLowerCase()],
  );
  const row = rows[0];
  if (!row) return emptyRatingSummary();
  return { count: Number(row.n || 0), average: Number(row.avg || 0) };
}

function mapRow(row: Record<string, unknown>): EventReview {
  return {
    id: String(row.id),
    rating: Number(row.rating),
    comment: String(row.comment),
    createdAt: String(row.created_at),
    authorName: String(row.author_name || "Pembeli"),
    eventTitle: String(row.event_title || ""),
    eventSlug: String(row.event_slug || ""),
    organizerName: String(row.organizer_name || "Penyelenggara"),
    eventRatingAverage: Number(row.event_rating_avg || 0),
    eventRatingCount: Number(row.event_review_count || 0),
  };
}

const REVIEW_SELECT = `r.id, r.rating, r.comment, r.created_at::text,
            u.name AS author_name, e.title AS event_title, e.slug AS event_slug, p.name AS organizer_name,
            (SELECT COUNT(*) FROM event_reviews x WHERE x.event_id = r.event_id)::text AS event_review_count,
            (SELECT COALESCE(ROUND(AVG(x.rating)::numeric, 1), 0) FROM event_reviews x WHERE x.event_id = r.event_id)::text AS event_rating_avg`;

export async function listRecentReviews(limit = 12): Promise<EventReview[]> {
  const cap = Math.min(Math.max(limit || 12, 1), 24);
  const rows = await query<Record<string, unknown>>(
    `SELECT ${REVIEW_SELECT}
     FROM event_reviews r
     JOIN users u ON u.id = r.user_id
     JOIN events e ON e.id = r.event_id
     JOIN organizer_profiles p ON p.id = e.organizer_profile_id
     WHERE e.status IN ('PUBLISHED', 'COMPLETED')
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT $1`,
    [cap],
  );
  return rows.map(mapRow);
}

export async function listEventReviews(slug: string): Promise<EventReview[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT ${REVIEW_SELECT}
     FROM event_reviews r
     JOIN users u ON u.id = r.user_id
     JOIN events e ON e.id = r.event_id
     JOIN organizer_profiles p ON p.id = e.organizer_profile_id
     WHERE e.slug = $1 AND e.status IN ('PUBLISHED', 'COMPLETED')
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT 50`,
    [slug.trim().toLowerCase()],
  );
  return rows.map(mapRow);
}

async function eventBySlug(slug: string) {
  const rows = await query<{ id: string; organizer_profile_id: string; status: string }>(
    `SELECT id, organizer_profile_id, status::text AS status FROM events WHERE slug = $1 LIMIT 1`,
    [slug.trim().toLowerCase()],
  );
  return rows[0] || null;
}

export async function canReviewEvent(user: AuthUser, eventId: string): Promise<boolean> {
  const rows = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
     FROM tickets t
     WHERE t.event_id = $1 AND t.owner_user_id = $2 AND t.status IN ('UNUSED', 'USED')`,
    [eventId, user.id],
  );
  return Number(rows[0]?.n || 0) > 0;
}

export async function getMyReview(user: AuthUser, eventId: string): Promise<EventReview | null> {
  const rows = await query<Record<string, unknown>>(
    `SELECT ${REVIEW_SELECT}
     FROM event_reviews r
     JOIN users u ON u.id = r.user_id
     JOIN events e ON e.id = r.event_id
     JOIN organizer_profiles p ON p.id = e.organizer_profile_id
     WHERE r.event_id = $1 AND r.user_id = $2 LIMIT 1`,
    [eventId, user.id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function upsertReview(user: AuthUser, slug: string, body: Record<string, unknown>): Promise<EventReview> {
  const event = await eventBySlug(slug);
  if (!event || (event.status !== "PUBLISHED" && event.status !== "COMPLETED")) {
    throw new AppError("NOT_FOUND", "Event tidak ditemukan.", {}, 404);
  }
  if (!(await canReviewEvent(user, event.id))) {
    throw new AppError("FORBIDDEN", "Ulasan hanya untuk pembeli tiket event ini.", {}, 403);
  }
  const input = normalizeReviewInput(body);
  const existing = await query<{ id: string }>(`SELECT id FROM event_reviews WHERE event_id = $1 AND user_id = $2 LIMIT 1`, [
    event.id,
    user.id,
  ]);
  if (existing[0]) {
    await execute(
      `UPDATE event_reviews SET rating = $2, comment = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [existing[0].id, input.rating, input.comment],
    );
  } else {
    await execute(
      `INSERT INTO event_reviews (id, event_id, user_id, rating, comment) VALUES ($1, $2, $3, $4, $5)`,
      [newId(), event.id, user.id, input.rating, input.comment],
    );
  }
  const mine = await getMyReview(user, event.id);
  if (!mine) throw new AppError("INTERNAL_ERROR", "Terjadi kesalahan internal.", {}, 500);
  return mine;
}
