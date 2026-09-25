import { dummyCover } from "@/lib/event-cover";
import { publicImageSrc } from "@/lib/server/gallery";
import { query } from "@/lib/server/http";

function n(v: string | number | null | undefined): number {
  return Number(v || 0);
}

export async function organizerDashboard(orgId: string, eventId = "", from = "", to = "") {
  const evFilter = eventId.trim();
  const fromTs = from.trim() || null;
  const toTs = to.trim() || null;
  const summaryRows = await query<{
    paid_orders: string;
    tickets_sold: string;
    gross: string;
    refunds: string;
    checkins: string;
  }>(
    `SELECT
       (SELECT COUNT(*)::text FROM orders o JOIN events e ON e.id=o.event_id
         WHERE e.organizer_profile_id=$1 AND o.status='PAID' AND ($2='' OR o.event_id=$2)
           AND ($3::timestamptz IS NULL OR o.paid_at >= $3) AND ($4::timestamptz IS NULL OR o.paid_at < $4)) AS paid_orders,
       (SELECT COUNT(*)::text FROM tickets t JOIN orders o ON o.id=t.order_id JOIN events e ON e.id=t.event_id
         WHERE e.organizer_profile_id=$1 AND o.status='PAID' AND ($2='' OR t.event_id=$2)
           AND ($3::timestamptz IS NULL OR t.issued_at >= $3) AND ($4::timestamptz IS NULL OR t.issued_at < $4)) AS tickets_sold,
       (SELECT COALESCE(SUM(oi.unit_price_rupiah * oi.quantity),0)::text FROM order_items oi
         JOIN orders o ON o.id=oi.order_id JOIN events e ON e.id=o.event_id
         WHERE e.organizer_profile_id=$1 AND o.status='PAID' AND ($2='' OR o.event_id=$2)
           AND ($3::timestamptz IS NULL OR o.paid_at >= $3) AND ($4::timestamptz IS NULL OR o.paid_at < $4)) AS gross,
       (SELECT COALESCE(SUM(rf.amount_rupiah),0)::text FROM refunds rf
         JOIN orders o ON o.id=rf.order_id JOIN events e ON e.id=o.event_id
         WHERE e.organizer_profile_id=$1 AND rf.status='COMPLETED' AND ($2='' OR o.event_id=$2)
           AND ($3::timestamptz IS NULL OR rf.completed_at >= $3) AND ($4::timestamptz IS NULL OR rf.completed_at < $4)) AS refunds,
       (SELECT COUNT(*)::text FROM tickets t JOIN orders o ON o.id=t.order_id JOIN events e ON e.id=t.event_id
         WHERE e.organizer_profile_id=$1 AND o.status='PAID' AND t.status='USED' AND ($2='' OR t.event_id=$2)
           AND ($3::timestamptz IS NULL OR t.used_at >= $3) AND ($4::timestamptz IS NULL OR t.used_at < $4)) AS checkins`,
    [orgId, evFilter, fromTs, toTs],
  );
  const s = summaryRows[0];
  const ticketsSold = n(s?.tickets_sold);
  const checkInCount = n(s?.checkins);
  const events = await query<{
    id: string;
    title: string;
    status: string;
    paid_order_count: string;
    tickets_sold: string;
    gross: string;
    check_in_count: string;
  }>(
    `SELECT e.id, e.title, e.status::text AS status,
            COALESCE(pay.paid_orders,0)::text AS paid_order_count,
            COALESCE(tk.tickets_sold,0)::text AS tickets_sold,
            COALESCE(pay.gross,0)::text AS gross,
            COALESCE(tk.checkins,0)::text AS check_in_count
     FROM events e
     LEFT JOIN LATERAL (
       SELECT COUNT(DISTINCT o.id)::int AS paid_orders,
              COALESCE(SUM(oi.unit_price_rupiah * oi.quantity),0)::bigint AS gross
       FROM orders o JOIN order_items oi ON oi.order_id=o.id
       WHERE o.event_id=e.id AND o.status='PAID'
     ) pay ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS tickets_sold, COUNT(*) FILTER (WHERE t.status='USED')::int AS checkins
       FROM tickets t JOIN orders o ON o.id=t.order_id AND o.status='PAID'
       WHERE t.event_id=e.id
     ) tk ON true
     WHERE e.organizer_profile_id=$1
     ORDER BY e.starts_at DESC, e.id DESC
     LIMIT 50`,
    [orgId],
  );
  const byEvent = await query<{ id: string; label: string; tickets: string; amount: string }>(
    `SELECT e.id, e.title AS label, COALESCE(SUM(oi.quantity),0)::text AS tickets,
            COALESCE(SUM(oi.line_total_rupiah),0)::text AS amount
     FROM events e
     LEFT JOIN orders o ON o.event_id=e.id AND o.status='PAID'
     LEFT JOIN order_items oi ON oi.order_id=o.id
     WHERE e.organizer_profile_id=$1 AND ($2='' OR e.id=$2)
     GROUP BY e.id, e.title
     ORDER BY COALESCE(SUM(oi.line_total_rupiah),0) DESC
     LIMIT 12`,
    [orgId, evFilter],
  );
  const byCategory = await query<{ id: string; label: string; tickets: string; amount: string }>(
    `SELECT e.category AS id, e.category AS label, COALESCE(SUM(oi.quantity),0)::text AS tickets,
            COALESCE(SUM(oi.line_total_rupiah),0)::text AS amount
     FROM events e
     JOIN orders o ON o.event_id=e.id AND o.status='PAID'
     JOIN order_items oi ON oi.order_id=o.id
     WHERE e.organizer_profile_id=$1 AND ($2='' OR e.id=$2)
     GROUP BY e.category
     ORDER BY COALESCE(SUM(oi.line_total_rupiah),0) DESC
     LIMIT 12`,
    [orgId, evFilter],
  );
  const bar = (rows: { id: string; label: string; tickets: string; amount: string }[]) =>
    rows.map((r) => ({ id: r.id, label: r.label, ticketsSold: n(r.tickets), grossSandboxRupiah: n(r.amount) }));
  return {
    summary: {
      paidOrderCount: n(s?.paid_orders),
      ticketsSold,
      grossSandboxRupiah: n(s?.gross),
      completedRefundRupiah: n(s?.refunds),
      checkInCount,
      attendanceRate: ticketsSold ? checkInCount / ticketsSold : null,
    },
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      status: e.status,
      paidOrderCount: n(e.paid_order_count),
      ticketsSold: n(e.tickets_sold),
      grossSandboxRupiah: n(e.gross),
      checkInCount: n(e.check_in_count),
    })),
    nextCursor: "",
    charts: { events: bar(byEvent), categories: bar(byCategory), ticketTypes: [] as { id: string; label: string; ticketsSold: number; grossSandboxRupiah: number }[] },
    range: { from, to },
    asOf: new Date().toISOString(),
    sandbox: true,
  };
}

export async function salesTrend(orgId: string, eventId: string, from: string, to: string, bucket: string) {
  const trunc = bucket === "week" ? "week" : "day";
  const rows = await query<{ bucket: string; paid: string; gross: string; tix: string }>(
    `SELECT bucket::text, COUNT(*)::text AS paid, COALESCE(SUM(gross),0)::text AS gross, COALESCE(SUM(tix),0)::text AS tix
     FROM (
       SELECT date_trunc('${trunc}', o.paid_at) AS bucket, o.id,
              (SELECT COALESCE(SUM(oi.unit_price_rupiah * oi.quantity),0) FROM order_items oi WHERE oi.order_id=o.id) AS gross,
              (SELECT COUNT(*) FROM tickets t WHERE t.order_id=o.id) AS tix
       FROM orders o
       JOIN events e ON e.id=o.event_id
       WHERE e.organizer_profile_id=$1 AND o.event_id=$2 AND o.status='PAID'
         AND ($3::timestamptz IS NULL OR o.paid_at >= $3)
         AND ($4::timestamptz IS NULL OR o.paid_at < $4)
     ) s
     GROUP BY bucket
     ORDER BY bucket`,
    [orgId, eventId, from.trim() || null, to.trim() || null],
  );
  const series = rows.map((r) => ({
    startAt: new Date(r.bucket).toISOString(),
    paidOrders: n(r.paid),
    ticketsSold: n(r.tix),
    grossSandboxRupiah: n(r.gross),
  }));
  return {
    series,
    totals: {
      paidOrderCount: series.reduce((a, b) => a + b.paidOrders, 0),
      ticketsSold: series.reduce((a, b) => a + b.ticketsSold, 0),
      grossSandboxRupiah: series.reduce((a, b) => a + b.grossSandboxRupiah, 0),
    },
    timezone: "Asia/Jakarta",
    sandbox: true,
  };
}

export async function listParticipants(orgId: string, eventId: string) {
  const rows = await query<{
    id: string;
    ticket_number: string;
    order_number: string;
    holder_name: string;
    holder_email: string;
    holder_phone: string;
    holder_nik: string;
    ticket_type_name: string | null;
    section_name: string | null;
    seat_label: string | null;
    status: string;
    issued_at: string | null;
    used_at: string | null;
  }>(
    `SELECT t.id, t.ticket_number, o.order_number,
            COALESCE(NULLIF(btrim(t.holder_full_name), ''), a.full_name, u.name, '') AS holder_name,
            COALESCE(NULLIF(btrim(t.holder_email), ''), a.email, u.email, '') AS holder_email,
            COALESCE(NULLIF(btrim(t.holder_phone), ''), a.phone, '') AS holder_phone,
            COALESCE(NULLIF(t.holder_identity_number, '0000000000000000'), a.identity_number, '') AS holder_nik,
            t.ticket_type_name, t.section_name, t.seat_label,
            t.status::text AS status, t.issued_at::text, t.used_at::text
     FROM tickets t
     JOIN orders o ON o.id=t.order_id
     JOIN events e ON e.id=t.event_id
     JOIN users u ON u.id=t.owner_user_id
     LEFT JOIN order_attendees a ON a.order_item_id = t.order_item_id AND a.unit_sequence = t.unit_sequence
     WHERE e.organizer_profile_id=$1 AND t.event_id=$2 AND o.status IN ('PAID','REFUNDED')
     ORDER BY t.issued_at ASC, t.id ASC
     LIMIT 5000`,
    [orgId, eventId],
  );
  return rows.map((r) => ({
    id: r.id,
    ticketNumber: r.ticket_number,
    orderNumber: r.order_number,
    holderName: r.holder_name,
    holderEmail: r.holder_email,
    holderPhone: r.holder_phone,
    holderIdentityNumber: r.holder_nik === "0000000000000000" ? "" : r.holder_nik,
    ticketTypeName: r.ticket_type_name || "",
    sectionName: r.section_name || "",
    seatLabel: r.seat_label || "",
    status: r.status,
    issuedAt: r.issued_at,
    usedAt: r.used_at,
  }));
}

export async function adminOperationsQueue(queue: string) {
  const q = ["moderation", "late-payment", "mismatch", "cancellation", "refund"].includes(queue) ? queue : "moderation";
  let sql = "";
  if (q === "moderation") {
    sql = `SELECT entity_type, entity_id, reason_code, status, occurred_at::text, safe_summary FROM (
             SELECT 'OrganizerProfile' AS entity_type, id AS entity_id, 'PENDING_REVIEW' AS reason_code, status::text AS status,
                    COALESCE(submitted_at, created_at) AS occurred_at, 'Pengajuan organizer menunggu keputusan' AS safe_summary
             FROM organizer_profiles WHERE status='PENDING'
             UNION ALL
             SELECT 'Event', id, 'PENDING_REVIEW', status::text, COALESCE(submitted_at, created_at), 'Event menunggu moderasi'
             FROM events WHERE status='PENDING_REVIEW'
           ) q ORDER BY occurred_at DESC, entity_id DESC LIMIT 25`;
  } else if (q === "late-payment") {
    sql = `SELECT 'Payment' AS entity_type, id AS entity_id, 'PAYMENT_PENDING_LATE' AS reason_code, status::text AS status,
                  created_at::text AS occurred_at, 'Pembayaran pending melebihi 15 menit' AS safe_summary
           FROM payments WHERE status='PENDING' AND created_at < statement_timestamp() - INTERVAL '15 minutes'
           ORDER BY created_at DESC, id DESC LIMIT 25`;
  } else if (q === "mismatch") {
    sql = `SELECT 'PaymentReconciliation' AS entity_type, id AS entity_id, 'RECONCILIATION_OPEN' AS reason_code, status::text AS status,
                  created_at::text AS occurred_at, 'Rekonsiliasi pembayaran terbuka' AS safe_summary
           FROM payment_reconciliations WHERE status='OPEN'
           ORDER BY created_at DESC, id DESC LIMIT 25`;
  } else if (q === "cancellation") {
    sql = `SELECT 'Event' AS entity_type, id AS entity_id, 'EVENT_CANCELLED' AS reason_code, status::text AS status,
                  COALESCE(cancelled_at, updated_at)::text AS occurred_at, 'Event dibatalkan' AS safe_summary
           FROM events WHERE status='CANCELLED'
           ORDER BY COALESCE(cancelled_at, updated_at) DESC, id DESC LIMIT 25`;
  } else {
    sql = `SELECT 'Refund' AS entity_type, id AS entity_id, status::text AS reason_code, status::text AS status,
                  COALESCE(requested_at, created_at)::text AS occurred_at, 'Refund sandbox menunggu tindak lanjut' AS safe_summary
           FROM refunds WHERE status IN ('REQUESTED','APPROVED')
           ORDER BY COALESCE(requested_at, created_at) DESC, id DESC LIMIT 25`;
  }
  const rows = await query<{
    entity_type: string;
    entity_id: string;
    reason_code: string;
    status: string;
    occurred_at: string;
    safe_summary: string;
  }>(sql);
  return {
    items: rows.map((r) => ({
      entityType: r.entity_type,
      entityId: r.entity_id,
      reasonCode: r.reason_code,
      status: r.status,
      occurredAt: new Date(r.occurred_at).toISOString(),
      safeSummary: r.safe_summary,
    })),
    nextCursor: "",
    countsAsOf: new Date().toISOString(),
    sandbox: true,
  };
}

export async function adminOperationsHealth() {
  const ok = true;
  return {
    backupFreshness: "unknown",
    alerts: [] as string[],
    requestErrorRate: 0,
    app: ok ? "ok" : "error",
    database: "ok",
    runtime: "nextjs",
  };
}

export async function recommendations(slug: string, limit: number) {
  const cap = Math.min(Math.max(limit || 6, 1), 12);
  const ev = await query<{ id: string; category: string; city: string }>(
    `SELECT id, category, city FROM events WHERE slug=$1 AND status='PUBLISHED' LIMIT 1`,
    [slug],
  );
  if (!ev[0]) return { items: [] as Record<string, unknown>[], mode: "CONTEXTUAL" };
  const rows = await query<{
    id: string;
    slug: string;
    title: string;
    category: string;
    city: string;
    province: string;
    starts_at: string;
    timezone: string;
    organizer_name: string;
  }>(
    `SELECT e.id, e.slug, e.title, e.category, e.city, e.province, e.starts_at::text, e.timezone,
            COALESCE(p.name, '') AS organizer_name
     FROM events e
     LEFT JOIN organizer_profiles p ON p.id = e.organizer_profile_id
     WHERE e.status='PUBLISHED' AND e.starts_at > NOW() AND e.slug <> $1
       AND (lower(e.category)=lower($2) OR lower(e.city)=lower($3))
     ORDER BY e.starts_at ASC LIMIT $4`,
    [slug, ev[0].category, ev[0].city, cap],
  );
  const items = [];
  for (const r of rows) {
    const gallery = await query<{ image_url: string }>(
      `SELECT image_url FROM event_gallery_images WHERE event_id = $1 ORDER BY sort_order, id LIMIT 1`,
      [r.id],
    );
    const url = publicImageSrc(gallery[0]?.image_url || "", dummyCover(r.category, r.title));
    const sameCategory = r.category.toLowerCase() === ev[0].category.toLowerCase();
    items.push({
      slug: r.slug,
      title: r.title,
      category: r.category,
      city: r.city,
      province: r.province,
      startsAt: new Date(r.starts_at).toISOString(),
      timezone: r.timezone || "Asia/Jakarta",
      organizer: { name: r.organizer_name },
      image: { url, altText: r.title },
      reason: sameCategory ? "Kategori yang sama." : "Kota yang sama.",
    });
  }
  return { items, mode: "CONTEXTUAL" };
}
