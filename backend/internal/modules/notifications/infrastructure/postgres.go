package infrastructure

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"myticketin/internal/modules/notifications/domain"
	platdb "myticketin/internal/platform/db"
)

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *platdb.Pool) *Store { return &Store{pool: pool.Raw()} }

func (s *Store) InsertOutbox(ctx context.Context, row domain.OutboxRow) error {
	raw, _ := json.Marshal(row.Payload)
	_, err := exec(ctx, s, `INSERT INTO notification_outbox (id,domain_event_id,recipient_user_id,notification_type,payload,status,next_attempt_at)
		VALUES ($1,$2,$3,$4::notification_type,$5::jsonb,'PENDING',CURRENT_TIMESTAMP)`,
		row.ID, row.DomainEventID, row.RecipientID, string(row.Type), raw)
	return mapUnique(err)
}

func (s *Store) ClaimDue(ctx context.Context, limit int, worker string, now time.Time) ([]domain.OutboxRow, error) {
	_ = now
	rows, err := query(ctx, s, `
		WITH due AS (
			SELECT id FROM notification_outbox
			WHERE status IN ('PENDING','FAILED') AND next_attempt_at <= statement_timestamp()
			ORDER BY next_attempt_at, id
			LIMIT $1
			FOR UPDATE SKIP LOCKED
		)
		UPDATE notification_outbox o
		SET status='PROCESSING', locked_at=statement_timestamp(), locked_by=$2, updated_at=statement_timestamp()
		FROM due WHERE o.id=due.id
		RETURNING o.id, o.domain_event_id, o.recipient_user_id, o.notification_type::text, o.payload, o.attempt_count, o.next_attempt_at`,
		limit, worker)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.OutboxRow
	for rows.Next() {
		var row domain.OutboxRow
		var payload []byte
		var typ string
		if err := rows.Scan(&row.ID, &row.DomainEventID, &row.RecipientID, &typ, &payload, &row.AttemptCount, &row.NextAttemptAt); err != nil {
			return nil, err
		}
		row.Type = domain.Type(typ)
		row.Status = domain.OutboxProcessing
		_ = json.Unmarshal(payload, &row.Payload)
		if row.Payload == nil {
			row.Payload = map[string]any{}
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *Store) CompleteOutbox(ctx context.Context, id string, now time.Time) error {
	_, err := exec(ctx, s, `UPDATE notification_outbox SET status='COMPLETED', completed_at=$2, locked_at=NULL, locked_by=NULL, updated_at=$2 WHERE id=$1`, id, now)
	return err
}

func (s *Store) FailOutbox(ctx context.Context, id string, attempts int, next time.Time, code string, terminal bool) error {
	st := "PENDING"
	if terminal {
		st = "FAILED"
	}
	_, err := exec(ctx, s, `UPDATE notification_outbox SET status=$2::outbox_status, attempt_count=$3, next_attempt_at=$4, last_error_code=$5, locked_at=NULL, locked_by=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
		id, st, attempts, next, code)
	return err
}

func (s *Store) ReclaimStale(ctx context.Context, olderThan time.Time) error {
	_, err := exec(ctx, s, `UPDATE notification_outbox SET status='PENDING', locked_at=NULL, locked_by=NULL, updated_at=CURRENT_TIMESTAMP
		WHERE status='PROCESSING' AND locked_at < $1`, olderThan)
	return err
}

func (s *Store) UpsertInApp(ctx context.Context, n domain.Notification) (domain.Notification, error) {
	if n.ID == "" {
		id, err := platdb.NewID()
		if err != nil {
			return n, err
		}
		n.ID = id
	}
	var existing string
	err := rowQ(ctx, s, `SELECT id FROM notifications WHERE recipient_user_id=$1 AND deduplication_key=$2`, n.RecipientID, n.DedupKey).Scan(&existing)
	if err == nil {
		n.ID = existing
		return n, s.GetFill(ctx, &n)
	}
	if !errors.Is(err, pgx.ErrNoRows) && err != nil {
		return n, err
	}
	_, err = exec(ctx, s, `INSERT INTO notifications (id,recipient_user_id,type,title,body,action_path,entity_type,entity_id,deduplication_key,created_at)
		VALUES ($1,$2,$3::notification_type,$4,$5,$6,$7,$8,$9,$10)`,
		n.ID, n.RecipientID, string(n.Type), n.Title, n.Body, n.ActionPath, n.EntityType, n.EntityID, n.DedupKey, n.CreatedAt)
	if err != nil {
		if !isUniqueErr(err) {
			return n, err
		}
		var existing string
		if scanErr := rowQ(ctx, s, `SELECT id FROM notifications WHERE recipient_user_id=$1 AND deduplication_key=$2`, n.RecipientID, n.DedupKey).Scan(&existing); scanErr != nil {
			return n, scanErr
		}
		n.ID = existing
	}
	return n, s.GetFill(ctx, &n)
}

func (s *Store) GetFill(ctx context.Context, n *domain.Notification) error {
	got, err := s.Get(ctx, n.ID)
	if err != nil {
		return err
	}
	*n = got
	return nil
}

func (s *Store) UpsertDelivery(ctx context.Context, notificationID string, ch domain.Channel, status domain.DeliveryStatus, provider, msgID, templateKey, errCode string, attempts int, sentAt *time.Time) error {
	id, err := platdb.NewID()
	if err != nil {
		return err
	}
	var msg any
	if msgID != "" {
		msg = msgID
	}
	_, err = exec(ctx, s, `INSERT INTO notification_deliveries (id,notification_id,channel,status,provider,provider_message_id,template_key,attempt_count,last_error_code,sent_at)
		VALUES ($1,$2,$3::notification_channel,$4::notification_delivery_status,$5,$6,$7,$8,$9,$10)
		ON CONFLICT (notification_id, channel) DO UPDATE SET
			status=EXCLUDED.status, provider=EXCLUDED.provider, provider_message_id=EXCLUDED.provider_message_id,
			attempt_count=EXCLUDED.attempt_count, last_error_code=EXCLUDED.last_error_code, sent_at=EXCLUDED.sent_at, updated_at=CURRENT_TIMESTAMP`,
		id, notificationID, string(ch), string(status), provider, msg, templateKey, attempts, errCode, sentAt)
	return err
}

func (s *Store) List(ctx context.Context, userID, filter string, limit int, cursorAt *time.Time, cursorID string) ([]domain.Notification, error) {
	var cur any
	if cursorAt != nil {
		cur = *cursorAt
	}
	unread := filter == "unread"
	rows, err := query(ctx, s, `
		SELECT id, recipient_user_id, type::text, title, body, action_path, entity_type, entity_id, deduplication_key, created_at, read_at, expires_at
		FROM notifications
		WHERE recipient_user_id=$1
		  AND ($2=false OR read_at IS NULL)
		  AND ($3::timestamptz IS NULL OR (created_at, id) < ($3, $4))
		ORDER BY created_at DESC, id DESC
		LIMIT $5`, userID, unread, cur, cursorID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Notification
	for rows.Next() {
		n, err := scanNote(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func (s *Store) UnreadCount(ctx context.Context, userID string) (int, error) {
	var n int
	err := rowQ(ctx, s, `SELECT COUNT(*) FROM notifications WHERE recipient_user_id=$1 AND read_at IS NULL`, userID).Scan(&n)
	return n, err
}

func (s *Store) Get(ctx context.Context, id string) (domain.Notification, error) {
	n, err := scanNote(rowQ(ctx, s, `SELECT id, recipient_user_id, type::text, title, body, action_path, entity_type, entity_id, deduplication_key, created_at, read_at, expires_at FROM notifications WHERE id=$1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Notification{}, domain.ErrNotFound
	}
	return n, err
}

func (s *Store) MarkRead(ctx context.Context, id, userID string, now time.Time) (time.Time, error) {
	var at time.Time
	err := rowQ(ctx, s, `UPDATE notifications SET read_at=COALESCE(read_at,$3) WHERE id=$1 AND recipient_user_id=$2 RETURNING read_at`, id, userID, now).Scan(&at)
	if errors.Is(err, pgx.ErrNoRows) {
		return time.Time{}, domain.ErrNotFound
	}
	return at, err
}

func (s *Store) MarkReadAll(ctx context.Context, userID string, before time.Time) (int, error) {
	tag, err := exec(ctx, s, `UPDATE notifications SET read_at=$2 WHERE recipient_user_id=$1 AND read_at IS NULL AND created_at <= $2`, userID, before)
	if err != nil {
		return 0, err
	}
	if cmd, ok := tag.(pgconn.CommandTag); ok {
		return int(cmd.RowsAffected()), nil
	}
	return 0, nil
}

func (s *Store) ListReminderCandidates(ctx context.Context, now time.Time, afterEventID, afterUserID string, limit int) ([]domain.ReminderCandidate, error) {
	rows, err := query(ctx, s, `
		SELECT e.id, t.owner_user_id, e.title, e.venue_name, e.starts_at, e.timezone
		FROM tickets t
		JOIN orders o ON o.id=t.order_id
		JOIN events e ON e.id=t.event_id
		WHERE e.status='PUBLISHED' AND t.status='UNUSED' AND o.status='PAID'
		  AND e.starts_at > $1 AND e.starts_at - INTERVAL '24 hours' <= $1
		  AND (e.id, t.owner_user_id) > ($2, $3)
		GROUP BY e.id, t.owner_user_id, e.title, e.venue_name, e.starts_at, e.timezone
		ORDER BY e.id, t.owner_user_id
		LIMIT $4`, now, afterEventID, afterUserID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.ReminderCandidate
	for rows.Next() {
		var c domain.ReminderCandidate
		if err := rows.Scan(&c.EventID, &c.RecipientID, &c.Title, &c.Venue, &c.StartsAt, &c.Timezone); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) ReminderEligible(ctx context.Context, eventID, userID string, now time.Time) (bool, error) {
	var n int
	err := rowQ(ctx, s, `
		SELECT COUNT(*) FROM tickets t
		JOIN orders o ON o.id=t.order_id
		JOIN events e ON e.id=t.event_id
		WHERE e.id=$1 AND t.owner_user_id=$2 AND e.status='PUBLISHED' AND t.status='UNUSED' AND o.status='PAID'
		  AND e.starts_at > $3 AND e.starts_at - INTERVAL '24 hours' <= $3`, eventID, userID, now).Scan(&n)
	return n > 0, err
}

func (s *Store) CancelledRecipients(ctx context.Context, eventID string) ([]string, error) {
	rows, err := query(ctx, s, `SELECT DISTINCT buyer_user_id FROM orders WHERE event_id=$1 AND status IN ('PAID','REFUNDED')`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func scanNote(row interface{ Scan(dest ...any) error }) (domain.Notification, error) {
	var n domain.Notification
	var typ string
	err := row.Scan(&n.ID, &n.RecipientID, &typ, &n.Title, &n.Body, &n.ActionPath, &n.EntityType, &n.EntityID, &n.DedupKey, &n.CreatedAt, &n.ReadAt, &n.ExpiresAt)
	n.Type = domain.Type(typ)
	return n, err
}

func mapUnique(err error) error {
	if isUniqueErr(err) {
		return errors.New("23505")
	}
	return err
}

func isUniqueErr(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func exec(ctx context.Context, s *Store, sql string, args ...any) (any, error) {
	if tx := platdb.TxFrom(ctx); tx != nil {
		return tx.Exec(ctx, sql, args...)
	}
	return s.pool.Exec(ctx, sql, args...)
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
