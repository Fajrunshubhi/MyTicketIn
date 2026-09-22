package infrastructure

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	eventdomain "myticketin/internal/modules/events/domain"
	orderdomain "myticketin/internal/modules/orders/domain"
	ticketdomain "myticketin/internal/modules/tickets/domain"
	platdb "myticketin/internal/platform/db"
)

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *platdb.Pool) *Store { return &Store{pool: pool.Raw()} }

const ticketCols = `id,ticket_number,manual_code,order_id,order_item_id,event_id,ticket_type_id,ticket_type_name,section_name,seat_label,event_seat_id,owner_user_id,holder_full_name,holder_email,holder_phone,holder_identity_number,unit_sequence,status::text,token_hash,token_ciphertext,token_nonce,token_auth_tag,token_key_version,issued_at,used_at,cancelled_at,cancellation_source::text,cancellation_reference_id,created_at,updated_at,version`

const orderCols = `id,order_number,buyer_user_id,event_id,status::text,currency,subtotal_rupiah,loyalty_discount_rupiah,total_payable_rupiah,loyalty_account_id,redeemed_points,loyalty_earned_points,loyalty_reversed_points,loyalty_redeemed_restored,expires_at,expired_at,cancelled_at,cancellation_reason,created_at,updated_at,version`

const eventCols = `id, organizer_profile_id, slug, title, description, category, venue_name, address_line, city, province, timezone, starts_at, ends_at, terms, contact_email, contact_phone, status::text, inventory_mode::text, submitted_at, moderation_reason, decided_at, decided_by_user_id, published_at, cancelled_at, cancelled_by_user_id, cancellation_reason, completed_at, created_at, updated_at, version`

func (s *Store) ClaimIssuance(ctx context.Context, run ticketdomain.IssuanceRun) (ticketdomain.IssuanceRun, bool, error) {
	_, err := exec(ctx, s, `INSERT INTO ticket_issuance_runs (id,order_id,status,expected_quantity,issued_quantity,started_at,correlation_id)
		VALUES ($1,$2,'STARTED',$3,0,$4,$5) ON CONFLICT (order_id) DO NOTHING`,
		run.ID, run.OrderID, run.ExpectedQuantity, run.StartedAt, run.CorrelationID)
	if err != nil {
		return ticketdomain.IssuanceRun{}, false, err
	}
	out, err := s.GetIssuance(ctx, run.OrderID)
	if err != nil {
		return ticketdomain.IssuanceRun{}, false, err
	}
	return out, out.ID == run.ID, nil
}

func (s *Store) CompleteIssuance(ctx context.Context, run ticketdomain.IssuanceRun) error {
	_, err := exec(ctx, s, `UPDATE ticket_issuance_runs SET status='COMPLETED', issued_quantity=$2, completed_at=$3
		WHERE order_id=$1 AND status='STARTED'`, run.OrderID, run.IssuedQuantity, run.CompletedAt)
	return err
}

func (s *Store) GetIssuance(ctx context.Context, orderID string) (ticketdomain.IssuanceRun, error) {
	var r ticketdomain.IssuanceRun
	var status string
	err := rowQ(ctx, s, `SELECT id,order_id,status::text,expected_quantity,issued_quantity,started_at,completed_at,failure_code,correlation_id
		FROM ticket_issuance_runs WHERE order_id=$1`, orderID).Scan(
		&r.ID, &r.OrderID, &status, &r.ExpectedQuantity, &r.IssuedQuantity, &r.StartedAt, &r.CompletedAt, &r.FailureCode, &r.CorrelationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ticketdomain.IssuanceRun{}, ticketdomain.ErrNotFound
	}
	r.Status = ticketdomain.IssuanceStatus(status)
	return r, err
}

func (s *Store) HasUnit(ctx context.Context, orderItemID string, seq int) (bool, error) {
	var n int
	err := rowQ(ctx, s, `SELECT COUNT(*) FROM tickets WHERE order_item_id=$1 AND unit_sequence=$2`, orderItemID, seq).Scan(&n)
	return n > 0, err
}

func (s *Store) InsertTicket(ctx context.Context, t ticketdomain.Ticket) error {
	src := (*string)(nil)
	if t.CancellationSource != nil {
		v := string(*t.CancellationSource)
		src = &v
	}
	_, err := exec(ctx, s, `INSERT INTO tickets (
		id,ticket_number,manual_code,order_id,order_item_id,event_id,ticket_type_id,ticket_type_name,section_name,seat_label,event_seat_id,
		owner_user_id,holder_full_name,holder_email,holder_phone,holder_identity_number,unit_sequence,status,token_hash,token_ciphertext,token_nonce,token_auth_tag,token_key_version,issued_at,used_at,cancelled_at,
		cancellation_source,cancellation_reference_id,created_at,updated_at,version)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::ticket_status,$19,$20,$21,$22,$23,$24,$25,$26,$27::ticket_cancellation_source,$28,$29,$30,$31)`,
		t.ID, t.TicketNumber, t.ManualCode, t.OrderID, t.OrderItemID, t.EventID, t.TicketTypeID, t.TicketTypeName, t.SectionName, t.SeatLabel, t.EventSeatID,
		t.OwnerUserID, t.HolderFullName, t.HolderEmail, t.HolderPhone, t.HolderIdentityNumber, t.UnitSequence, string(t.Status), t.TokenHash, t.TokenCiphertext, t.TokenNonce, t.TokenAuthTag, t.TokenKeyVersion, t.IssuedAt, t.UsedAt, t.CancelledAt,
		src, t.CancellationReferenceID, t.CreatedAt, t.UpdatedAt, t.Version)
	return mapInsert(err)
}

func (s *Store) CountOrder(ctx context.Context, orderID string) (int, error) {
	var n int
	err := rowQ(ctx, s, `SELECT COUNT(*) FROM tickets WHERE order_id=$1`, orderID).Scan(&n)
	return n, err
}

func (s *Store) CountUsed(ctx context.Context, orderID string) (int, error) {
	var n int
	err := rowQ(ctx, s, `SELECT COUNT(*) FROM tickets WHERE order_id=$1 AND status='USED'`, orderID).Scan(&n)
	return n, err
}

func (s *Store) ListOwner(ctx context.Context, ownerID, status string, limit int, cursorAt *time.Time, cursorID string) ([]ticketdomain.Ticket, error) {
	var rows pgx.Rows
	var err error
	if status == "" {
		if cursorAt == nil {
			rows, err = query(ctx, s, `SELECT `+ticketCols+` FROM tickets WHERE owner_user_id=$1 ORDER BY issued_at DESC, id DESC LIMIT $2`, ownerID, limit)
		} else {
			rows, err = query(ctx, s, `SELECT `+ticketCols+` FROM tickets WHERE owner_user_id=$1 AND (issued_at, id) < ($2, $3) ORDER BY issued_at DESC, id DESC LIMIT $4`, ownerID, *cursorAt, cursorID, limit)
		}
	} else {
		if cursorAt == nil {
			rows, err = query(ctx, s, `SELECT `+ticketCols+` FROM tickets WHERE owner_user_id=$1 AND status=$2::ticket_status ORDER BY issued_at DESC, id DESC LIMIT $3`, ownerID, status, limit)
		} else {
			rows, err = query(ctx, s, `SELECT `+ticketCols+` FROM tickets WHERE owner_user_id=$1 AND status=$2::ticket_status AND (issued_at, id) < ($3, $4) ORDER BY issued_at DESC, id DESC LIMIT $5`, ownerID, status, *cursorAt, cursorID, limit)
		}
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ticketdomain.Ticket
	for rows.Next() {
		t, err := scanTicket(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) Get(ctx context.Context, id string) (ticketdomain.Ticket, error) {
	return scanTicket(rowQ(ctx, s, `SELECT `+ticketCols+` FROM tickets WHERE id=$1`, id))
}

func (s *Store) GetEvent(ctx context.Context, id string) (eventdomain.Event, error) {
	var e eventdomain.Event
	var status, mode string
	err := rowQ(ctx, s, `SELECT `+eventCols+` FROM events WHERE id=$1`, id).Scan(
		&e.ID, &e.OrganizerProfileID, &e.Slug, &e.Title, &e.Description, &e.Category, &e.VenueName, &e.AddressLine, &e.City, &e.Province, &e.Timezone, &e.StartsAt, &e.EndsAt, &e.Terms, &e.ContactEmail, &e.ContactPhone, &status, &mode, &e.SubmittedAt, &e.ModerationReason, &e.DecidedAt, &e.DecidedByUserID, &e.PublishedAt, &e.CancelledAt, &e.CancelledByUserID, &e.CancellationReason, &e.CompletedAt, &e.CreatedAt, &e.UpdatedAt, &e.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		return eventdomain.Event{}, eventdomain.ErrNotFound
	}
	e.Status = eventdomain.Status(status)
	e.InventoryMode = eventdomain.InventoryMode(mode)
	return e, err
}

func (s *Store) GetOrder(ctx context.Context, id string) (orderdomain.Order, error) {
	o, err := scanOrder(rowQ(ctx, s, `SELECT `+orderCols+` FROM orders WHERE id=$1`, id))
	if err != nil {
		return orderdomain.Order{}, err
	}
	items, err := s.listItems(ctx, id)
	o.Items = items
	return o, err
}

func (s *Store) listItems(ctx context.Context, orderID string) ([]orderdomain.Item, error) {
	rows, err := query(ctx, s, `SELECT id,order_id,ticket_type_id,ticket_type_name,section_name,seat_label,event_seat_id,unit_price_rupiah,quantity,line_total_rupiah FROM order_items WHERE order_id=$1 ORDER BY id`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []orderdomain.Item
	for rows.Next() {
		var it orderdomain.Item
		if err := rows.Scan(&it.ID, &it.OrderID, &it.TicketTypeID, &it.TicketTypeName, &it.SectionName, &it.SeatLabel, &it.EventSeatID, &it.UnitPriceRupiah, &it.Quantity, &it.LineTotalRupiah); err != nil {
			return nil, err
		}
		out = append(out, it)
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

func (s *Store) CancelUnused(ctx context.Context, orderID, eventID, source, ref string, now time.Time) (int, error) {
	var tag any
	var err error
	if orderID != "" {
		tag, err = exec(ctx, s, `UPDATE tickets SET status='CANCELLED', cancelled_at=$2, cancellation_source=$3::ticket_cancellation_source,
			cancellation_reference_id=$4, updated_at=$2, version=version+1 WHERE order_id=$1 AND status='UNUSED'`, orderID, now, source, ref)
	} else {
		tag, err = exec(ctx, s, `UPDATE tickets SET status='CANCELLED', cancelled_at=$2, cancellation_source=$3::ticket_cancellation_source,
			cancellation_reference_id=$4, updated_at=$2, version=version+1 WHERE event_id=$1 AND status='UNUSED'`, eventID, now, source, ref)
	}
	if err != nil {
		return 0, err
	}
	if c, ok := tag.(pgconn.CommandTag); ok {
		return int(c.RowsAffected()), nil
	}
	return 0, nil
}

func (s *Store) ListPaidIncomplete(ctx context.Context, limit int) ([]orderdomain.Order, error) {
	rows, err := query(ctx, s, `SELECT `+orderCols+` FROM orders o
		WHERE o.status='PAID' AND (
			NOT EXISTS (SELECT 1 FROM ticket_issuance_runs r WHERE r.order_id=o.id AND r.status='COMPLETED')
			OR (SELECT COUNT(*) FROM tickets t WHERE t.order_id=o.id) <> (
				SELECT COALESCE(SUM(quantity),0) FROM order_items i WHERE i.order_id=o.id
			)
		)
		ORDER BY o.updated_at, o.id
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []orderdomain.Order
	for rows.Next() {
		o, err := scanOrder(rows)
		if err != nil {
			return nil, err
		}
		items, err := s.listItems(ctx, o.ID)
		if err != nil {
			return nil, err
		}
		o.Items = items
		out = append(out, o)
	}
	return out, rows.Err()
}

func scanTicket(row interface{ Scan(dest ...any) error }) (ticketdomain.Ticket, error) {
	var t ticketdomain.Ticket
	var status, source string
	var srcPtr *string
	err := row.Scan(&t.ID, &t.TicketNumber, &t.ManualCode, &t.OrderID, &t.OrderItemID, &t.EventID, &t.TicketTypeID, &t.TicketTypeName, &t.SectionName, &t.SeatLabel, &t.EventSeatID, &t.OwnerUserID, &t.HolderFullName, &t.HolderEmail, &t.HolderPhone, &t.HolderIdentityNumber, &t.UnitSequence, &status, &t.TokenHash, &t.TokenCiphertext, &t.TokenNonce, &t.TokenAuthTag, &t.TokenKeyVersion, &t.IssuedAt, &t.UsedAt, &t.CancelledAt, &srcPtr, &t.CancellationReferenceID, &t.CreatedAt, &t.UpdatedAt, &t.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		return ticketdomain.Ticket{}, ticketdomain.ErrNotFound
	}
	t.Status = ticketdomain.Status(status)
	if srcPtr != nil {
		source = *srcPtr
		cs := ticketdomain.CancelSource(source)
		t.CancellationSource = &cs
	}
	return t, err
}

func scanOrder(row interface{ Scan(dest ...any) error }) (orderdomain.Order, error) {
	var o orderdomain.Order
	var status string
	err := row.Scan(&o.ID, &o.OrderNumber, &o.BuyerUserID, &o.EventID, &status, &o.Currency, &o.SubtotalRupiah, &o.LoyaltyDiscountRupiah, &o.TotalPayableRupiah, &o.LoyaltyAccountID, &o.RedeemedPoints, &o.LoyaltyEarnedPoints, &o.LoyaltyReversedPoints, &o.LoyaltyRedeemedRestored, &o.ExpiresAt, &o.ExpiredAt, &o.CancelledAt, &o.CancellationReason, &o.CreatedAt, &o.UpdatedAt, &o.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		return orderdomain.Order{}, orderdomain.ErrNotFound
	}
	o.Status = orderdomain.Status(status)
	return o, err
}

func mapInsert(err error) error {
	if err == nil {
		return nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		switch {
		case strings.Contains(pgErr.ConstraintName, "token_hash"),
			strings.Contains(pgErr.ConstraintName, "ticket_number"),
			strings.Contains(pgErr.ConstraintName, "manual_code"):
			return ticketdomain.ErrTokenCollision
		case strings.Contains(pgErr.ConstraintName, "holder_identity"):
			return ticketdomain.ErrIssuanceInvariant
		}
	}
	return err
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
