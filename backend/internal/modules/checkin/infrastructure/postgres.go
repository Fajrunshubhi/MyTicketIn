package infrastructure

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"myticketin/internal/modules/checkin/domain"
	eventdomain "myticketin/internal/modules/events/domain"
	orgdomain "myticketin/internal/modules/organizers/domain"
	platdb "myticketin/internal/platform/db"
)

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *platdb.Pool) *Store { return &Store{pool: pool.Raw()} }

const eventCols = `id, organizer_profile_id, slug, title, description, category, venue_name, address_line, city, province, timezone, starts_at, ends_at, terms, contact_email, contact_phone, status::text, inventory_mode::text, submitted_at, moderation_reason, decided_at, decided_by_user_id, published_at, cancelled_at, cancelled_by_user_id, cancellation_reason, completed_at, created_at, updated_at, version`

func (s *Store) GetEvent(ctx context.Context, id string) (eventdomain.Event, error) {
	var e eventdomain.Event
	var status, mode string
	err := rowQ(ctx, s, `SELECT `+eventCols+` FROM events WHERE id=$1`, id).Scan(
		&e.ID, &e.OrganizerProfileID, &e.Slug, &e.Title, &e.Description, &e.Category, &e.VenueName, &e.AddressLine, &e.City, &e.Province, &e.Timezone, &e.StartsAt, &e.EndsAt, &e.Terms, &e.ContactEmail, &e.ContactPhone, &status, &mode, &e.SubmittedAt, &e.ModerationReason, &e.DecidedAt, &e.DecidedByUserID, &e.PublishedAt, &e.CancelledAt, &e.CancelledByUserID, &e.CancellationReason, &e.CompletedAt, &e.CreatedAt, &e.UpdatedAt, &e.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		return eventdomain.Event{}, domain.ErrNotFound
	}
	e.Status = eventdomain.Status(status)
	e.InventoryMode = eventdomain.InventoryMode(mode)
	return e, err
}

func (s *Store) GetStaffByUser(ctx context.Context, eventID, userID string) (eventdomain.StaffAssignment, error) {
	var a eventdomain.StaffAssignment
	var status string
	err := rowQ(ctx, s, `SELECT id,event_id,user_id,status::text,assigned_by_user_id,assigned_at,revoked_by_user_id,revoked_at,revocation_reason,created_at,updated_at,version
		FROM event_staff_assignments WHERE event_id=$1 AND user_id=$2`, eventID, userID).Scan(
		&a.ID, &a.EventID, &a.UserID, &status, &a.AssignedByUserID, &a.AssignedAt, &a.RevokedByUserID, &a.RevokedAt, &a.RevocationReason, &a.CreatedAt, &a.UpdatedAt, &a.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		return eventdomain.StaffAssignment{}, eventdomain.ErrStaffNotFound
	}
	a.Status = eventdomain.StaffStatus(status)
	return a, err
}

func (s *Store) GetProfile(ctx context.Context, id string) (orgdomain.Profile, error) {
	var p orgdomain.Profile
	var st string
	err := rowQ(ctx, s, `SELECT id,owner_user_id,name,contact_email,contact_phone,description,status::text,decision_reason,submitted_at,decided_at,decided_by_user_id,created_at,updated_at,version
		FROM organizer_profiles WHERE id=$1`, id).Scan(
		&p.ID, &p.OwnerUserID, &p.Name, &p.ContactEmail, &p.ContactPhone, &p.Description, &st, &p.DecisionReason, &p.SubmittedAt, &p.DecidedAt, &p.DecidedByUserID, &p.CreatedAt, &p.UpdatedAt, &p.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		return orgdomain.Profile{}, domain.ErrNotFound
	}
	p.Status = orgdomain.Status(st)
	return p, err
}

func (s *Store) LookupQR(ctx context.Context, tokenHash string) (*domain.TicketView, error) {
	return s.lookup(ctx, `SELECT t.id,t.event_id,t.status::text,o.status::text,t.ticket_number,t.ticket_type_name,t.section_name,t.seat_label,t.used_at,t.used_by_user_id
		FROM tickets t JOIN orders o ON o.id=t.order_id WHERE t.token_hash=$1 FOR UPDATE OF t`, tokenHash)
}

func (s *Store) LookupManual(ctx context.Context, code string) (*domain.TicketView, error) {
	return s.lookup(ctx, `SELECT t.id,t.event_id,t.status::text,o.status::text,t.ticket_number,t.ticket_type_name,t.section_name,t.seat_label,t.used_at,t.used_by_user_id
		FROM tickets t JOIN orders o ON o.id=t.order_id WHERE t.manual_code=$1 FOR UPDATE OF t`, code)
}

func (s *Store) lookup(ctx context.Context, q string, arg string) (*domain.TicketView, error) {
	var t domain.TicketView
	err := rowQ(ctx, s, q, arg).Scan(&t.ID, &t.EventID, &t.Status, &t.OrderStatus, &t.TicketNumber, &t.TicketTypeName, &t.SectionName, &t.SeatLabel, &t.UsedAt, &t.UsedByUserID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *Store) MarkUsed(ctx context.Context, ticketID, eventID, actorID string, now time.Time) (bool, *time.Time, error) {
	var usedAt time.Time
	err := rowQ(ctx, s, `UPDATE tickets SET status='USED', used_at=$4, used_by_user_id=$3, updated_at=$4, version=version+1
		WHERE id=$1 AND event_id=$2 AND status='UNUSED' RETURNING used_at`, ticketID, eventID, actorID, now).Scan(&usedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil, nil
	}
	if err != nil {
		return false, nil, err
	}
	return true, &usedAt, nil
}

func (s *Store) GetAttemptByKey(ctx context.Context, operatorID, eventID, keyHash string) (domain.Attempt, error) {
	a, err := scanAttempt(rowQ(ctx, s, `SELECT a.id,a.event_id,a.ticket_id,a.operator_user_id,a.input_type::text,a.result::text,a.reason_code,a.attempted_at,a.first_used_at,a.input_fingerprint,a.idempotency_key_hash,a.request_hash,a.correlation_id,a.duration_ms,a.client_context,
		COALESCE(t.ticket_number,''),COALESCE(t.ticket_type_name,''),t.section_name,t.seat_label
		FROM check_in_attempts a LEFT JOIN tickets t ON t.id=a.ticket_id
		WHERE a.operator_user_id=$1 AND a.event_id=$2 AND a.idempotency_key_hash=$3`, operatorID, eventID, keyHash))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Attempt{}, domain.ErrNotFound
	}
	return a, err
}

func (s *Store) InsertAttempt(ctx context.Context, a domain.Attempt) error {
	body, err := json.Marshal(a.ClientContext)
	if err != nil {
		return err
	}
	if len(body) == 0 {
		body = []byte("{}")
	}
	_, err = exec(ctx, s, `INSERT INTO check_in_attempts (
		id,event_id,ticket_id,operator_user_id,input_type,result,reason_code,attempted_at,first_used_at,input_fingerprint,idempotency_key_hash,request_hash,correlation_id,duration_ms,client_context)
		VALUES ($1,$2,$3,$4,$5::check_in_input_type,$6::check_in_result,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
		a.ID, a.EventID, a.TicketID, a.OperatorUserID, string(a.InputType), string(a.Result), a.ReasonCode, a.AttemptedAt, a.FirstUsedAt, a.InputFingerprint, a.IdempotencyHash, a.RequestHash, a.CorrelationID, a.DurationMS, string(body))
	if err == nil {
		return nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		if strings.Contains(pgErr.ConstraintName, "operator_event") {
			return domain.ErrKeyReused
		}
		return domain.ErrUnavailable
	}
	return err
}

func (s *Store) ListAttempts(ctx context.Context, eventID, result string, from, to *time.Time, limit int, cursorAt *time.Time, cursorID string) ([]domain.Attempt, error) {
	q := `SELECT a.id,a.event_id,a.ticket_id,a.operator_user_id,a.input_type::text,a.result::text,a.reason_code,a.attempted_at,a.first_used_at,a.input_fingerprint,a.idempotency_key_hash,a.request_hash,a.correlation_id,a.duration_ms,a.client_context,
		COALESCE(t.ticket_number,''),COALESCE(t.ticket_type_name,''),t.section_name,t.seat_label
		FROM check_in_attempts a LEFT JOIN tickets t ON t.id=a.ticket_id WHERE a.event_id=$1`
	args := []any{eventID}
	n := 2
	if result != "" {
		q += ` AND a.result=$` + strconv.Itoa(n) + `::check_in_result`
		args = append(args, result)
		n++
	}
	if from != nil {
		q += ` AND a.attempted_at >= $` + strconv.Itoa(n)
		args = append(args, *from)
		n++
	}
	if to != nil {
		q += ` AND a.attempted_at < $` + strconv.Itoa(n)
		args = append(args, *to)
		n++
	}
	if cursorAt != nil {
		q += ` AND (a.attempted_at, a.id) < ($` + strconv.Itoa(n) + `,$` + strconv.Itoa(n+1) + `)`
		args = append(args, *cursorAt, cursorID)
		n += 2
	}
	q += ` ORDER BY a.attempted_at DESC, a.id DESC LIMIT $` + strconv.Itoa(n)
	args = append(args, limit)
	rows, err := query(ctx, s, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Attempt
	for rows.Next() {
		a, err := scanAttempt(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) GetUserName(ctx context.Context, id string) (string, error) {
	var name string
	err := rowQ(ctx, s, `SELECT name FROM users WHERE id=$1`, id).Scan(&name)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return name, err
}

func scanAttempt(row interface{ Scan(dest ...any) error }) (domain.Attempt, error) {
	var a domain.Attempt
	var input, result string
	var ctxRaw string
	err := row.Scan(&a.ID, &a.EventID, &a.TicketID, &a.OperatorUserID, &input, &result, &a.ReasonCode, &a.AttemptedAt, &a.FirstUsedAt, &a.InputFingerprint, &a.IdempotencyHash, &a.RequestHash, &a.CorrelationID, &a.DurationMS, &ctxRaw, &a.TicketNumber, &a.TicketTypeName, &a.SectionName, &a.SeatLabel)
	a.InputType = domain.InputType(input)
	a.Result = domain.Result(result)
	if ctxRaw != "" {
		_ = json.Unmarshal([]byte(ctxRaw), &a.ClientContext)
	}
	return a, err
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
