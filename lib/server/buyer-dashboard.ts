import type { AuthUser } from "@/lib/server/access";
import { query } from "@/lib/server/http";
import { BUYER_EVENT_CHART_LIMIT, fillMonthlySpend, statusSlices, withOtherEvents } from "@/lib/buyer-dashboard";

function money(value: unknown): number {
  return Math.max(0, Math.trunc(Number(value || 0)));
}

export async function getBuyerDashboard(user: AuthUser, nowMs = Date.now()) {
  const [
    spendRows,
    refundRows,
    statusRows,
    monthRows,
    eventRows,
    otherEventRows,
    ticketRows,
    nextRows,
    pointRows,
  ] = await Promise.all([
    query<{ spent: string; paid: string; pending: string }>(
      `SELECT
         COALESCE(SUM(total_payable_rupiah) FILTER (WHERE status = 'PAID'::order_status), 0)::text AS spent,
         COUNT(*) FILTER (WHERE status = 'PAID'::order_status)::text AS paid,
         COUNT(*) FILTER (WHERE status = 'PENDING'::order_status)::text AS pending
       FROM orders WHERE buyer_user_id=$1`,
      [user.id],
    ),
    query<{ refunded: string }>(
      `SELECT COALESCE(SUM(r.amount_rupiah), 0)::text AS refunded
       FROM refunds r
       JOIN orders o ON o.id = r.order_id
       WHERE o.buyer_user_id=$1 AND r.status = 'COMPLETED'::refund_status`,
      [user.id],
    ),
    query<{ status: string; n: string }>(
      `SELECT status::text AS status, COUNT(*)::text AS n
       FROM orders WHERE buyer_user_id=$1
       GROUP BY status`,
      [user.id],
    ),
    query<{ month_key: string; spent: string; orders: string }>(
      `SELECT to_char(o.paid_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM') AS month_key,
              COALESCE(SUM(o.total_payable_rupiah), 0)::text AS spent,
              COUNT(*)::text AS orders
       FROM orders o
       WHERE o.buyer_user_id=$1
         AND o.status = 'PAID'::order_status
         AND o.paid_at >= CURRENT_TIMESTAMP - INTERVAL '7 months'
       GROUP BY 1`,
      [user.id],
    ),
    query<{ event_id: string; title: string; spent: string; orders: string }>(
      `SELECT e.id AS event_id, e.title,
              COALESCE(SUM(o.total_payable_rupiah), 0)::text AS spent,
              COUNT(*)::text AS orders
       FROM orders o
       JOIN events e ON e.id = o.event_id
       WHERE o.buyer_user_id=$1 AND o.status = 'PAID'::order_status
       GROUP BY e.id, e.title
       ORDER BY SUM(o.total_payable_rupiah) DESC, COUNT(*) DESC
       LIMIT ${BUYER_EVENT_CHART_LIMIT}`,
      [user.id],
    ),
    query<{ event_count: string; spent: string; orders: string }>(
      `SELECT COUNT(*)::text AS event_count,
              COALESCE(SUM(spent), 0)::text AS spent,
              COALESCE(SUM(ord), 0)::text AS orders
       FROM (
         SELECT e.id,
                SUM(o.total_payable_rupiah) AS spent,
                COUNT(*) AS ord,
                ROW_NUMBER() OVER (ORDER BY SUM(o.total_payable_rupiah) DESC, COUNT(*) DESC, e.id) AS rn
         FROM orders o
         JOIN events e ON e.id = o.event_id
         WHERE o.buyer_user_id=$1 AND o.status = 'PAID'::order_status
         GROUP BY e.id
       ) ranked
       WHERE rn > ${BUYER_EVENT_CHART_LIMIT}`,
      [user.id],
    ),
    query<{ upcoming: string; used: string; cancelled: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE t.status = 'UNUSED'::ticket_status AND e.starts_at > CURRENT_TIMESTAMP)::text AS upcoming,
         COUNT(*) FILTER (WHERE t.status = 'USED'::ticket_status)::text AS used,
         COUNT(*) FILTER (WHERE t.status = 'CANCELLED'::ticket_status)::text AS cancelled
       FROM tickets t
       JOIN events e ON e.id = t.event_id
       WHERE t.owner_user_id=$1`,
      [user.id],
    ),
    query<{
      id: string;
      ticket_number: string;
      title: string;
      starts_at: string;
      venue_name: string;
      city: string;
      slug: string;
    }>(
      `SELECT t.id, t.ticket_number, e.title, e.starts_at::text AS starts_at, e.venue_name, e.city, e.slug
       FROM tickets t
       JOIN events e ON e.id = t.event_id
       WHERE t.owner_user_id=$1
         AND t.status = 'UNUSED'::ticket_status
         AND e.starts_at > CURRENT_TIMESTAMP
       ORDER BY e.starts_at ASC, t.id ASC
       LIMIT 1`,
      [user.id],
    ),
    query<{ points: string }>(
      `SELECT COALESCE(SUM(GREATEST(balance_points - reserved_points - debt_points, 0)), 0)::text AS points
       FROM loyalty_accounts WHERE buyer_user_id=$1`,
      [user.id],
    ),
  ]);

  const next = nextRows[0];
  return {
    spentRupiah: money(spendRows[0]?.spent),
    refundedRupiah: money(refundRows[0]?.refunded),
    paidOrderCount: money(spendRows[0]?.paid),
    pendingOrderCount: money(spendRows[0]?.pending),
    activeTicketCount: money(ticketRows[0]?.upcoming),
    usedTicketCount: money(ticketRows[0]?.used),
    cancelledTicketCount: money(ticketRows[0]?.cancelled),
    loyaltyPoints: money(pointRows[0]?.points),
    nextTicket: next
      ? {
          id: next.id,
          ticketNumber: next.ticket_number,
          title: next.title,
          startsAt: new Date(next.starts_at).toISOString(),
          venue: [next.venue_name, next.city].filter(Boolean).join(", "),
          slug: next.slug,
        }
      : null,
    monthlySpend: fillMonthlySpend(
      nowMs,
      monthRows.map((row) => ({
        key: row.month_key,
        spentRupiah: money(row.spent),
        orders: money(row.orders),
      })),
    ),
    orderStatus: statusSlices(statusRows.map((row) => ({ status: row.status, count: money(row.n) }))),
    eventSpend: withOtherEvents(
      eventRows.map((row) => ({
        eventId: row.event_id,
        title: row.title,
        spentRupiah: money(row.spent),
        orders: money(row.orders),
      })),
      {
        eventCount: money(otherEventRows[0]?.event_count),
        spentRupiah: money(otherEventRows[0]?.spent),
        orders: money(otherEventRows[0]?.orders),
      },
    ),
  };
}
