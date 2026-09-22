package infrastructure

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	orgdomain "myticketin/internal/modules/organizers/domain"
	"myticketin/internal/modules/reporting/domain"
	platdb "myticketin/internal/platform/db"
)

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *platdb.Pool) *Store { return &Store{pool: pool.Raw()} }

func (s *Store) OrganizerID(ctx context.Context, ownerUserID string) (string, error) {
	var id, status string
	err := rowQ(ctx, s, `SELECT id, status::text FROM organizer_profiles WHERE owner_user_id=$1`, ownerUserID).Scan(&id, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", orgdomain.ErrRequired
	}
	if err != nil {
		return "", err
	}
	if status != string(orgdomain.StatusApproved) {
		return "", orgdomain.ErrNotApproved
	}
	return id, nil
}

func (s *Store) EventOwned(ctx context.Context, organizerID, eventID string) (bool, error) {
	var n int
	err := rowQ(ctx, s, `SELECT 1 FROM events WHERE id=$1 AND organizer_profile_id=$2`, eventID, organizerID).Scan(&n)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

func (s *Store) Aggregate(ctx context.Context, organizerID, eventID string, r domain.Range) (domain.Summary, error) {
	from, to := rangeArgs(r)
	var sum domain.Summary
	err := rowQ(ctx, s, `
		SELECT
			(SELECT COUNT(*) FROM orders o JOIN events e ON e.id=o.event_id
			  WHERE e.organizer_profile_id=$1 AND o.status='PAID' AND ($2='' OR o.event_id=$2)
			    AND ($3::timestamptz IS NULL OR o.paid_at >= $3) AND ($4::timestamptz IS NULL OR o.paid_at < $4))::int,
			(SELECT COUNT(*) FROM tickets t JOIN orders o ON o.id=t.order_id JOIN events e ON e.id=t.event_id
			  WHERE e.organizer_profile_id=$1 AND o.status='PAID' AND ($2='' OR t.event_id=$2)
			    AND ($3::timestamptz IS NULL OR t.issued_at >= $3) AND ($4::timestamptz IS NULL OR t.issued_at < $4))::int,
			(SELECT COALESCE(SUM(oi.unit_price_rupiah * oi.quantity),0) FROM order_items oi
			  JOIN orders o ON o.id=oi.order_id JOIN events e ON e.id=o.event_id
			  WHERE e.organizer_profile_id=$1 AND o.status='PAID' AND ($2='' OR o.event_id=$2)
			    AND ($3::timestamptz IS NULL OR o.paid_at >= $3) AND ($4::timestamptz IS NULL OR o.paid_at < $4)),
			(SELECT COALESCE(SUM(rf.amount_rupiah),0) FROM refunds rf
			  JOIN orders o ON o.id=rf.order_id JOIN events e ON e.id=o.event_id
			  WHERE e.organizer_profile_id=$1 AND rf.status='COMPLETED' AND ($2='' OR o.event_id=$2)
			    AND ($3::timestamptz IS NULL OR rf.completed_at >= $3) AND ($4::timestamptz IS NULL OR rf.completed_at < $4)),
			(SELECT COUNT(*) FROM tickets t JOIN orders o ON o.id=t.order_id JOIN events e ON e.id=t.event_id
			  WHERE e.organizer_profile_id=$1 AND o.status='PAID' AND t.status='USED' AND ($2='' OR t.event_id=$2)
			    AND ($3::timestamptz IS NULL OR t.used_at >= $3) AND ($4::timestamptz IS NULL OR t.used_at < $4))::int
	`, organizerID, eventID, from, to).Scan(&sum.PaidOrderCount, &sum.TicketsSold, &sum.GrossSandboxRupiah, &sum.CompletedRefundRupiah, &sum.CheckInCount)
	return sum, err
}

func (s *Store) ListEvents(ctx context.Context, organizerID string, r domain.Range, limit int, cursorAt *time.Time, cursorID string) ([]domain.EventRow, error) {
	from, to := rangeArgs(r)
	var cur any
	if cursorAt != nil {
		cur = *cursorAt
	}
	rows, err := query(ctx, s, `
		SELECT e.id, e.title, e.status::text, e.starts_at,
			COALESCE(pay.paid_orders,0), COALESCE(tk.tickets_sold,0), COALESCE(pay.gross,0), COALESCE(tk.checkins,0)
		FROM events e
		LEFT JOIN LATERAL (
			SELECT COUNT(DISTINCT o.id)::int AS paid_orders,
				COALESCE(SUM(oi.unit_price_rupiah * oi.quantity),0)::bigint AS gross
			FROM orders o
			JOIN order_items oi ON oi.order_id=o.id
			WHERE o.event_id=e.id AND o.status='PAID'
			  AND ($2::timestamptz IS NULL OR o.paid_at >= $2) AND ($3::timestamptz IS NULL OR o.paid_at < $3)
		) pay ON true
		LEFT JOIN LATERAL (
			SELECT COUNT(*)::int AS tickets_sold,
				COUNT(*) FILTER (WHERE t.status='USED')::int AS checkins
			FROM tickets t JOIN orders o ON o.id=t.order_id AND o.status='PAID'
			WHERE t.event_id=e.id
			  AND ($2::timestamptz IS NULL OR t.issued_at >= $2) AND ($3::timestamptz IS NULL OR t.issued_at < $3)
		) tk ON true
		WHERE e.organizer_profile_id=$1
		  AND ($4::timestamptz IS NULL OR (e.starts_at, e.id) < ($4, $5))
		ORDER BY e.starts_at DESC, e.id DESC
		LIMIT $6
	`, organizerID, from, to, cur, cursorID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.EventRow
	for rows.Next() {
		var row domain.EventRow
		if err := rows.Scan(&row.ID, &row.Title, &row.Status, &row.StartsAt, &row.PaidOrderCount, &row.TicketsSold, &row.GrossSandboxRupiah, &row.CheckInCount); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *Store) SalesBreakdown(ctx context.Context, organizerID, eventID string, r domain.Range) ([]domain.SalesBar, []domain.SalesBar, []domain.SalesBar, error) {
	from, to := rangeArgs(r)
	events, err := scanSalesBars(ctx, s, `
		SELECT e.id, e.title, COALESCE(SUM(oi.quantity),0)::int, COALESCE(SUM(oi.line_total_rupiah),0)::bigint
		FROM events e
		LEFT JOIN orders o ON o.event_id=e.id AND o.status='PAID'
		  AND ($3::timestamptz IS NULL OR o.paid_at >= $3) AND ($4::timestamptz IS NULL OR o.paid_at < $4)
		LEFT JOIN order_items oi ON oi.order_id=o.id
		WHERE e.organizer_profile_id=$1 AND ($2='' OR e.id=$2)
		GROUP BY e.id, e.title
		ORDER BY COALESCE(SUM(oi.line_total_rupiah),0) DESC, e.title ASC
		LIMIT 12
	`, organizerID, eventID, from, to)
	if err != nil {
		return nil, nil, nil, err
	}
	categories, err := scanSalesBars(ctx, s, `
		SELECT e.category, e.category, COALESCE(SUM(oi.quantity),0)::int, COALESCE(SUM(oi.line_total_rupiah),0)::bigint
		FROM events e
		JOIN orders o ON o.event_id=e.id AND o.status='PAID'
		  AND ($3::timestamptz IS NULL OR o.paid_at >= $3) AND ($4::timestamptz IS NULL OR o.paid_at < $4)
		JOIN order_items oi ON oi.order_id=o.id
		WHERE e.organizer_profile_id=$1 AND ($2='' OR e.id=$2)
		GROUP BY e.category
		ORDER BY COALESCE(SUM(oi.line_total_rupiah),0) DESC, e.category ASC
		LIMIT 12
	`, organizerID, eventID, from, to)
	if err != nil {
		return nil, nil, nil, err
	}
	types, err := scanSalesBars(ctx, s, `
		SELECT oi.ticket_type_name, oi.ticket_type_name, COALESCE(SUM(oi.quantity),0)::int, COALESCE(SUM(oi.line_total_rupiah),0)::bigint
		FROM order_items oi
		JOIN orders o ON o.id=oi.order_id AND o.status='PAID'
		  AND ($3::timestamptz IS NULL OR o.paid_at >= $3) AND ($4::timestamptz IS NULL OR o.paid_at < $4)
		JOIN events e ON e.id=o.event_id
		WHERE e.organizer_profile_id=$1 AND ($2='' OR e.id=$2)
		GROUP BY oi.ticket_type_name
		ORDER BY COALESCE(SUM(oi.line_total_rupiah),0) DESC, oi.ticket_type_name ASC
		LIMIT 12
	`, organizerID, eventID, from, to)
	return events, categories, types, err
}

func scanSalesBars(ctx context.Context, s *Store, sql string, args ...any) ([]domain.SalesBar, error) {
	rows, err := query(ctx, s, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.SalesBar
	for rows.Next() {
		var bar domain.SalesBar
		if err := rows.Scan(&bar.Key, &bar.Label, &bar.TicketsSold, &bar.GrossSandboxRupiah); err != nil {
			return nil, err
		}
		out = append(out, bar)
	}
	if out == nil {
		out = []domain.SalesBar{}
	}
	return out, rows.Err()
}

func (s *Store) SalesTrend(ctx context.Context, organizerID, eventID, bucket string, r domain.Range) ([]map[string]any, domain.Summary, string, error) {
	from, to := rangeArgs(r)
	trunc := "day"
	if bucket == "week" {
		trunc = "week"
	}
	var tz string
	err := rowQ(ctx, s, `SELECT timezone FROM events WHERE id=$1 AND organizer_profile_id=$2`, eventID, organizerID).Scan(&tz)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.Summary{}, "", domain.ErrNotFound
	}
	if err != nil {
		return nil, domain.Summary{}, "", err
	}
	rows, err := query(ctx, s, `
		SELECT bucket, COUNT(*)::int, COALESCE(SUM(gross),0)::bigint, COALESCE(SUM(tix),0)::int
		FROM (
			SELECT date_trunc('`+trunc+`', o.paid_at AT TIME ZONE $5) AS bucket, o.id,
				(SELECT COALESCE(SUM(oi.unit_price_rupiah * oi.quantity),0) FROM order_items oi WHERE oi.order_id=o.id) AS gross,
				(SELECT COUNT(*) FROM tickets t WHERE t.order_id=o.id) AS tix
			FROM orders o
			WHERE o.event_id=$2 AND o.status='PAID'
			  AND EXISTS (SELECT 1 FROM events e WHERE e.id=o.event_id AND e.organizer_profile_id=$1)
			  AND ($3::timestamptz IS NULL OR o.paid_at >= $3) AND ($4::timestamptz IS NULL OR o.paid_at < $4)
		) s
		GROUP BY bucket
		ORDER BY bucket`, organizerID, eventID, from, to, tz)
	if err != nil {
		return nil, domain.Summary{}, tz, err
	}
	defer rows.Close()
	var series []map[string]any
	var totals domain.Summary
	for rows.Next() {
		var start time.Time
		var paid, tickets int
		var gross int64
		if err := rows.Scan(&start, &paid, &gross, &tickets); err != nil {
			return nil, domain.Summary{}, tz, err
		}
		series = append(series, map[string]any{"startAt": start.UTC().Format(time.RFC3339), "paidOrders": paid, "ticketsSold": tickets, "grossSandboxRupiah": gross})
		totals.PaidOrderCount += paid
		totals.TicketsSold += tickets
		totals.GrossSandboxRupiah += gross
	}
	return series, totals, tz, rows.Err()
}

func (s *Store) ListParticipants(ctx context.Context, organizerID, eventID, ticketStatus, checkInResult string, r domain.Range, afterID string, limit int) ([]domain.Participant, error) {
	from, to := rangeArgs(r)
	status := strings.ToUpper(strings.TrimSpace(ticketStatus))
	result := strings.ToUpper(strings.TrimSpace(checkInResult))
	rows, err := query(ctx, s, `
		SELECT t.id, o.order_number, u.name, u.email, t.ticket_type_name, t.section_name, t.seat_label, t.status::text, t.issued_at, t.used_at
		FROM tickets t
		JOIN orders o ON o.id=t.order_id
		JOIN events e ON e.id=t.event_id
		JOIN users u ON u.id=t.owner_user_id
		WHERE e.organizer_profile_id=$1 AND t.event_id=$2 AND o.status IN ('PAID','REFUNDED')
		  AND ($3='' OR t.status::text=$3)
		  AND ($4='' OR ($4='VALID' AND t.status='USED') OR ($4='UNUSED' AND t.status='UNUSED'))
		  AND ($5::timestamptz IS NULL OR t.issued_at >= $5) AND ($6::timestamptz IS NULL OR t.issued_at < $6)
		  AND ($7='' OR t.id > $7)
		ORDER BY t.id ASC
		LIMIT $8
	`, organizerID, eventID, status, result, from, to, afterID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Participant
	for rows.Next() {
		var p domain.Participant
		if err := rows.Scan(&p.ID, &p.OrderNumber, &p.BuyerName, &p.BuyerEmail, &p.TicketType, &p.SectionName, &p.SeatLabel, &p.TicketStatus, &p.IssuedAt, &p.CheckedInAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) ListQueue(ctx context.Context, queue string, limit int, cursorAt *time.Time, cursorID string) ([]domain.QueueItem, error) {
	var cur any
	if cursorAt != nil {
		cur = *cursorAt
	}
	sql := ""
	switch queue {
	case "moderation":
		sql = `
			SELECT entity_type, entity_id, reason_code, status, occurred_at, safe_summary FROM (
				SELECT 'OrganizerProfile' AS entity_type, id AS entity_id, 'PENDING_REVIEW' AS reason_code, status::text,
					COALESCE(submitted_at, created_at) AS occurred_at, 'Pengajuan organizer menunggu keputusan' AS safe_summary
				FROM organizer_profiles WHERE status='PENDING_REVIEW'
				UNION ALL
				SELECT 'Event', id, 'PENDING_REVIEW', status::text, COALESCE(submitted_at, created_at), 'Event menunggu moderasi'
				FROM events WHERE status='PENDING_REVIEW'
			) q WHERE ($1::timestamptz IS NULL OR (occurred_at, entity_id) < ($1, $2))
			ORDER BY occurred_at DESC, entity_id DESC LIMIT $3`
	case "late-payment":
		sql = `
			SELECT 'Payment', id, 'PAYMENT_PENDING_LATE', status::text, created_at, 'Pembayaran pending melebihi 15 menit'
			FROM payments WHERE status='PENDING' AND created_at < statement_timestamp() - INTERVAL '15 minutes'
			  AND ($1::timestamptz IS NULL OR (created_at, id) < ($1, $2))
			ORDER BY created_at DESC, id DESC LIMIT $3`
	case "mismatch":
		sql = `
			SELECT 'PaymentReconciliation', id, 'RECONCILIATION_OPEN', status::text, created_at, 'Rekonsiliasi pembayaran terbuka'
			FROM payment_reconciliations WHERE status='OPEN'
			  AND ($1::timestamptz IS NULL OR (created_at, id) < ($1, $2))
			ORDER BY created_at DESC, id DESC LIMIT $3`
	case "cancellation":
		sql = `
			SELECT 'Event', id, 'EVENT_CANCELLED', status::text, COALESCE(cancelled_at, updated_at), 'Event dibatalkan'
			FROM events WHERE status='CANCELLED'
			  AND ($1::timestamptz IS NULL OR (COALESCE(cancelled_at, updated_at), id) < ($1, $2))
			ORDER BY 5 DESC, id DESC LIMIT $3`
	default:
		sql = `
			SELECT 'Refund', id, status::text, status::text, COALESCE(requested_at, created_at), 'Refund sandbox menunggu tindak lanjut'
			FROM refunds WHERE status IN ('REQUESTED','APPROVED')
			  AND ($1::timestamptz IS NULL OR (COALESCE(requested_at, created_at), id) < ($1, $2))
			ORDER BY 5 DESC, id DESC LIMIT $3`
	}
	rows, err := query(ctx, s, sql, cur, cursorID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.QueueItem
	for rows.Next() {
		var it domain.QueueItem
		if err := rows.Scan(&it.EntityType, &it.EntityID, &it.ReasonCode, &it.Status, &it.OccurredAt, &it.SafeSummary); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (s *Store) PublicEvent(ctx context.Context, slug string) (domain.Candidate, error) {
	var c domain.Candidate
	err := rowQ(ctx, s, `
		SELECT e.id, e.slug, e.title, e.category, e.city, e.province, e.starts_at, e.timezone, e.organizer_profile_id, p.name
		FROM events e JOIN organizer_profiles p ON p.id=e.organizer_profile_id
		WHERE e.slug=$1 AND e.status='PUBLISHED'`, slug).Scan(
		&c.ID, &c.Slug, &c.Title, &c.Category, &c.City, &c.Province, &c.StartsAt, &c.Timezone, &c.OrganizerID, &c.OrganizerName)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Candidate{}, domain.ErrNotFound
	}
	return c, err
}

func (s *Store) PaidSignals(ctx context.Context, buyerID string) (domain.Signal, error) {
	sig := domain.Signal{
		Category: map[string]int{}, City: map[string]int{}, Province: map[string]int{}, Organizer: map[string]int{}, Purchased: map[string]struct{}{},
	}
	rows, err := query(ctx, s, `
		SELECT e.id, e.category, e.city, e.province, e.organizer_profile_id
		FROM orders o JOIN events e ON e.id=o.event_id
		WHERE o.buyer_user_id=$1 AND o.status='PAID'`, buyerID)
	if err != nil {
		return sig, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, cat, city, prov, org string
		if err := rows.Scan(&id, &cat, &city, &prov, &org); err != nil {
			return sig, err
		}
		sig.Purchased[id] = struct{}{}
		sig.Category[cat]++
		sig.City[city]++
		sig.Province[prov]++
		sig.Organizer[org]++
	}
	return sig, rows.Err()
}

func (s *Store) Candidates(ctx context.Context, excludeID string, purchased []string, now time.Time) ([]domain.Candidate, error) {
	if purchased == nil {
		purchased = []string{}
	}
	rows, err := query(ctx, s, `
		SELECT e.id, e.slug, e.title, e.category, e.city, e.province, e.starts_at, e.timezone, e.organizer_profile_id, p.name
		FROM events e JOIN organizer_profiles p ON p.id=e.organizer_profile_id
		WHERE e.status='PUBLISHED' AND e.starts_at > $1 AND e.id <> $2
		  AND NOT (e.id = ANY($3))
		ORDER BY e.starts_at ASC, e.id ASC
		LIMIT 200`, now, excludeID, purchased)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Candidate
	for rows.Next() {
		var c domain.Candidate
		if err := rows.Scan(&c.ID, &c.Slug, &c.Title, &c.Category, &c.City, &c.Province, &c.StartsAt, &c.Timezone, &c.OrganizerID, &c.OrganizerName); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) Now(ctx context.Context) (time.Time, error) {
	var t time.Time
	err := rowQ(ctx, s, `SELECT statement_timestamp()`).Scan(&t)
	return t, err
}

func rangeArgs(r domain.Range) (any, any) {
	var from, to any
	if r.From != nil {
		from = *r.From
	}
	if r.To != nil {
		to = *r.To
	}
	return from, to
}

func rowQ(ctx context.Context, s *Store, sql string, args ...any) pgx.Row {
	if tx := platdb.TxFrom(ctx); tx != nil {
		return tx.QueryRow(ctx, sql, args...)
	}
	return s.pool.QueryRow(ctx, sql, args...)
}

func query(ctx context.Context, s *Store, sql string, args ...any) (pgx.Rows, error) {
	if tx := platdb.TxFrom(ctx); tx != nil {
		return tx.Query(ctx, sql, args...)
	}
	return s.pool.Query(ctx, sql, args...)
}
