package ops

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type SnapshotSQL struct {
	WebhookFailures          int
	ExpiryLag                int
	NotificationLag          int
	ReminderLag              int
	CheckInP95               float64
	LoyaltyInvariantFailures int
}

func QuerySnapshot(ctx context.Context, pool *pgxpool.Pool) SnapshotSQL {
	out := SnapshotSQL{}
	if pool == nil {
		return out
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	out.WebhookFailures = count(ctx, pool, `SELECT COUNT(*) FROM payment_webhook_events WHERE processing_status='FAILED' AND received_at > statement_timestamp() - INTERVAL '15 minutes'`)
	out.ExpiryLag = count(ctx, pool, `SELECT COUNT(*) FROM orders WHERE status='PENDING' AND expires_at <= statement_timestamp() - INTERVAL '5 minutes'`)
	out.NotificationLag = count(ctx, pool, `SELECT COUNT(*) FROM notification_outbox WHERE status IN ('PENDING','FAILED') AND next_attempt_at <= statement_timestamp() - INTERVAL '5 minutes'`)
	out.ReminderLag = count(ctx, pool, `SELECT COUNT(*) FROM notification_outbox WHERE notification_type='EVENT_REMINDER' AND status IN ('PENDING','FAILED') AND next_attempt_at <= statement_timestamp() - INTERVAL '5 minutes'`)
	out.CheckInP95 = floatVal(ctx, pool, `SELECT COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0) FROM check_in_attempts WHERE attempted_at > statement_timestamp() - INTERVAL '15 minutes'`)
	out.LoyaltyInvariantFailures = count(ctx, pool, `SELECT COUNT(*) FROM loyalty_accounts WHERE balance_points < 0 OR debt_points < 0 OR reserved_points < 0`)
	return out
}

func count(ctx context.Context, pool *pgxpool.Pool, q string) int {
	var n int
	if err := pool.QueryRow(ctx, q).Scan(&n); err != nil {
		return 0
	}
	return n
}

func floatVal(ctx context.Context, pool *pgxpool.Pool, q string) float64 {
	var n float64
	if err := pool.QueryRow(ctx, q).Scan(&n); err != nil {
		return 0
	}
	return n
}
