import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/lib/server/http";
import { readJson, requireAuth, requireMutating } from "@/lib/server/guard";
import { canReviewEvent, getMyReview, listEventReviews, ratingSummaryBySlug, upsertReview } from "@/lib/server/reviews";
import { query } from "@/lib/server/http";

async function eventIdBySlug(slug: string) {
  const rows = await query<{ id: string }>(`SELECT id FROM events WHERE slug = $1 LIMIT 1`, [slug.trim().toLowerCase()]);
  return rows[0]?.id || "";
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const items = await listEventReviews(params.slug);
    const summary = await ratingSummaryBySlug(params.slug);
    let canReview = false;
    let mine = null;
    try {
      const user = await requireAuth(req);
      const eventId = await eventIdBySlug(params.slug);
      if (eventId) {
        canReview = await canReviewEvent(user, eventId);
        mine = await getMyReview(user, eventId);
      }
    } catch {
      canReview = false;
    }
    return jsonData({ items, canReview, mine, summary }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    requireMutating(req);
    const user = await requireAuth(req);
    const body = await readJson<Record<string, unknown>>(req);
    const review = await upsertReview(user, params.slug, body);
    return jsonData({ review }, 200, req);
  } catch (err) {
    return jsonError(err, req);
  }
}
