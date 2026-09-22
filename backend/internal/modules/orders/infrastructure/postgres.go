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
	loyaltydomain "myticketin/internal/modules/loyalty/domain"
	"myticketin/internal/modules/orders/domain"
	platdb "myticketin/internal/platform/db"
)

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *platdb.Pool) *Store { return &Store{pool: pool.Raw()} }

const eventCols = `id, organizer_profile_id, slug, title, description, category, venue_name, address_line, city, province, timezone, starts_at, ends_at, terms, contact_email, contact_phone, status::text, inventory_mode::text, submitted_at, moderation_reason, decided_at, decided_by_user_id, published_at, cancelled_at, cancelled_by_user_id, cancellation_reason, completed_at, created_at, updated_at, version`

const ticketCols = `id,event_id,name,description,price_rupiah,quota,max_per_account,sale_starts_at,sale_ends_at,sort_order,sales_stopped_at,sales_stopped_by_user_id,sales_stop_reason,created_at,updated_at,version,reserved_quantity,paid_quantity`

const orderCols = `id,order_number,buyer_user_id,event_id,status::text,currency,subtotal_rupiah,loyalty_discount_rupiah,total_payable_rupiah,loyalty_account_id,redeemed_points,loyalty_earned_points,loyalty_reversed_points,loyalty_redeemed_restored,expires_at,expired_at,cancelled_at,cancellation_reason,created_at,updated_at,version`

func (s *Store) GetEvent(ctx context.Context, id string) (eventdomain.Event, error) {
	return scanEvent(rowQ(ctx, s, `SELECT `+eventCols+` FROM events WHERE id=$1`, id))
}

func (s *Store) GetEventForUpdate(ctx context.Context, id string) (eventdomain.Event, error) {
	return scanEvent(rowQ(ctx, s, `SELECT `+eventCols+` FROM events WHERE id=$1 FOR UPDATE`, id))
}

func (s *Store) ListTickets(ctx context.Context, eventID string) ([]eventdomain.TicketType, error) {
	return s.lockTicketsQuery(ctx, `SELECT `+ticketCols+` FROM event_ticket_types WHERE event_id=$1 ORDER BY id`, eventID)
}

func (s *Store) LockTickets(ctx context.Context, ids []string) ([]eventdomain.TicketType, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	var out []eventdomain.TicketType
	for _, id := range ids {
		t, err := scanTicket(rowQ(ctx, s, `SELECT `+ticketCols+` FROM event_ticket_types WHERE id=$1 FOR UPDATE`, id))
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, nil
}

func (s *Store) lockTicketsQuery(ctx context.Context, q string, args ...any) ([]eventdomain.TicketType, error) {
	rows, err := query(ctx, s, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []eventdomain.TicketType
	for rows.Next() {
		t, err := scanTicket(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) ListSections(ctx context.Context, eventID string) ([]eventdomain.Section, error) {
	rows, err := query(ctx, s, `SELECT id,event_id,ticket_type_id,name,sort_order FROM venue_sections WHERE event_id=$1 ORDER BY sort_order,id`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []eventdomain.Section
	for rows.Next() {
		var sec eventdomain.Section
		if err := rows.Scan(&sec.ID, &sec.EventID, &sec.TicketTypeID, &sec.Name, &sec.SortOrder); err != nil {
			return nil, err
		}
		out = append(out, sec)
	}
	return out, rows.Err()
}

func (s *Store) ListSeats(ctx context.Context, eventID string) ([]eventdomain.Seat, error) {
	rows, err := query(ctx, s, `SELECT id,event_id,section_id,label FROM event_seats WHERE event_id=$1 ORDER BY label,id`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []eventdomain.Seat
	for rows.Next() {
		var seat eventdomain.Seat
		if err := rows.Scan(&seat.ID, &seat.EventID, &seat.SectionID, &seat.Label); err != nil {
			return nil, err
		}
		out = append(out, seat)
	}
	return out, rows.Err()
}

func (s *Store) GetSeat(ctx context.Context, id string) (eventdomain.Seat, error) {
	var seat eventdomain.Seat
	err := rowQ(ctx, s, `SELECT id,event_id,section_id,label FROM event_seats WHERE id=$1 FOR UPDATE`, id).Scan(&seat.ID, &seat.EventID, &seat.SectionID, &seat.Label)
	if errors.Is(err, pgx.ErrNoRows) {
		return eventdomain.Seat{}, domain.ErrSeatUnavailable
	}
	return seat, err
}

func (s *Store) IncrementReserved(ctx context.Context, ticketID string, n int) error {
	var reserved int
	err := rowQ(ctx, s, `UPDATE event_ticket_types SET reserved_quantity = reserved_quantity + $2, updated_at = CURRENT_TIMESTAMP, version = version + 1
		WHERE id=$1 AND reserved_quantity + paid_quantity + $2 <= quota RETURNING reserved_quantity`, ticketID, n).Scan(&reserved)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrInventory
	}
	return err
}

func (s *Store) DecrementReserved(ctx context.Context, ticketID string, n int) error {
	tag, err := exec(ctx, s, `UPDATE event_ticket_types SET reserved_quantity = reserved_quantity - $2, updated_at = CURRENT_TIMESTAMP, version = version + 1
		WHERE id=$1 AND reserved_quantity >= $2`, ticketID, n)
	if err != nil {
		return err
	}
	if cmd, ok := tag.(pgconn.CommandTag); ok && cmd.RowsAffected() == 0 {
		return domain.ErrConflict
	}
	return nil
}

func (s *Store) SeatHeld(ctx context.Context, seatID string) (bool, error) {
	var n int
	err := rowQ(ctx, s, `SELECT COUNT(1) FROM inventory_reservations WHERE event_seat_id=$1 AND released_at IS NULL`, seatID).Scan(&n)
	return n > 0, err
}

func (s *Store) ListHeldSeatIDs(ctx context.Context, eventID string) ([]string, error) {
	rows, err := query(ctx, s, `SELECT r.event_seat_id FROM inventory_reservations r
		JOIN orders o ON o.id = r.order_id
		WHERE o.event_id=$1 AND r.event_seat_id IS NOT NULL AND r.released_at IS NULL`, eventID)
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

func (s *Store) AccountUnits(ctx context.Context, buyerID, eventID, ticketTypeID string) (int, error) {
	var n int
	err := rowQ(ctx, s, `SELECT COALESCE((
			SELECT SUM(r.quantity)::int FROM inventory_reservations r
			JOIN orders o ON o.id=r.order_id
			WHERE o.buyer_user_id=$1 AND o.event_id=$2 AND r.ticket_type_id=$3 AND r.released_at IS NULL
		),0) + COALESCE((
			SELECT SUM(oi.quantity)::int FROM order_items oi
			JOIN orders o ON o.id=oi.order_id
			WHERE o.buyer_user_id=$1 AND o.event_id=$2 AND oi.ticket_type_id=$3 AND o.status='PAID'
		),0)`, buyerID, eventID, ticketTypeID).Scan(&n)
	return n, err
}

func (s *Store) InsertOrder(ctx context.Context, o *domain.Order) error {
	return rowQ(ctx, s, `INSERT INTO orders (
			id,order_number,buyer_user_id,event_id,status,currency,subtotal_rupiah,loyalty_discount_rupiah,total_payable_rupiah,
			loyalty_account_id,redeemed_points,expires_at,created_at,updated_at,version
		) VALUES (
			$1,$2,$3,$4,$5::order_status,$6,$7,$8,$9,$10,$11,
			transaction_timestamp() + INTERVAL '15 minutes', transaction_timestamp(), transaction_timestamp(), 1
		) RETURNING created_at, expires_at, version`,
		o.ID, o.OrderNumber, o.BuyerUserID, o.EventID, string(o.Status), o.Currency, o.SubtotalRupiah, o.LoyaltyDiscountRupiah, o.TotalPayableRupiah,
		o.LoyaltyAccountID, o.RedeemedPoints,
	).Scan(&o.CreatedAt, &o.ExpiresAt, &o.Version)
}

func (s *Store) UpdateOrder(ctx context.Context, o domain.Order, expected int) error {
	tag, err := exec(ctx, s, `UPDATE orders SET status=$1::order_status, expired_at=$2, cancelled_at=$3, cancellation_reason=$4, updated_at=CURRENT_TIMESTAMP, version=version+1
		WHERE id=$5 AND version=$6 AND status='PENDING'`,
		string(o.Status), o.ExpiredAt, o.CancelledAt, o.CancellationReason, o.ID, expected)
	if err != nil {
		return mapErr(err)
	}
	if cmd, ok := tag.(pgconn.CommandTag); ok && cmd.RowsAffected() == 0 {
		return domain.ErrConflict
	}
	return nil
}

func (s *Store) GetOrder(ctx context.Context, id string) (domain.Order, error) {
	o, err := scanOrder(rowQ(ctx, s, `SELECT `+orderCols+` FROM orders WHERE id=$1`, id))
	if err != nil {
		return domain.Order{}, err
	}
	items, err := s.listItems(ctx, id)
	o.Items = items
	return o, err
}

func (s *Store) GetOrderForUpdate(ctx context.Context, id string) (domain.Order, error) {
	o, err := scanOrder(rowQ(ctx, s, `SELECT `+orderCols+` FROM orders WHERE id=$1 FOR UPDATE`, id))
	if err != nil {
		return domain.Order{}, err
	}
	items, err := s.listItems(ctx, id)
	o.Items = items
	return o, err
}

func (s *Store) listItems(ctx context.Context, orderID string) ([]domain.Item, error) {
	rows, err := query(ctx, s, `SELECT id,order_id,ticket_type_id,ticket_type_name,section_name,seat_label,event_seat_id,unit_price_rupiah,quantity,line_total_rupiah FROM order_items WHERE order_id=$1 ORDER BY id`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Item
	for rows.Next() {
		var it domain.Item
		if err := rows.Scan(&it.ID, &it.OrderID, &it.TicketTypeID, &it.TicketTypeName, &it.SectionName, &it.SeatLabel, &it.EventSeatID, &it.UnitPriceRupiah, &it.Quantity, &it.LineTotalRupiah); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	byItem, err := s.listAttendees(ctx, orderID)
	if err != nil {
		return nil, err
	}
	for i := range out {
		out[i].Attendees = byItem[out[i].ID]
	}
	return out, nil
}

func (s *Store) listAttendees(ctx context.Context, orderID string) (map[string][]domain.AttendeeInput, error) {
	rows, err := query(ctx, s, `SELECT order_item_id, unit_sequence, full_name, email, phone, identity_number
		FROM order_attendees WHERE order_id=$1 ORDER BY order_item_id, unit_sequence`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string][]domain.AttendeeInput{}
	for rows.Next() {
		var itemID string
		var seq int
		var a domain.AttendeeInput
		if err := rows.Scan(&itemID, &seq, &a.FullName, &a.Email, &a.Phone, &a.IdentityNumber); err != nil {
			return nil, err
		}
		out[itemID] = append(out[itemID], a)
	}
	return out, rows.Err()
}

func (s *Store) InsertAttendees(ctx context.Context, eventID string, it domain.Item) error {
	for i, a := range it.Attendees {
		id, err := platdb.NewID()
		if err != nil {
			return err
		}
		_, err = exec(ctx, s, `INSERT INTO order_attendees (id,order_id,order_item_id,event_id,unit_sequence,full_name,email,phone,identity_number)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
			id, it.OrderID, it.ID, eventID, i+1, a.FullName, a.Email, a.Phone, a.IdentityNumber)
		if err != nil {
			return mapErr(err)
		}
	}
	return nil
}

func (s *Store) IdentityTaken(ctx context.Context, eventID, identityNumber, excludeOrderID string) (bool, error) {
	var n int
	err := rowQ(ctx, s, `SELECT COUNT(*) FROM order_attendees a
		JOIN orders o ON o.id = a.order_id
		WHERE a.event_id=$1 AND a.identity_number=$2 AND o.status IN ('PENDING','PAID')
		  AND ($3='' OR a.order_id <> $3)`, eventID, identityNumber, excludeOrderID).Scan(&n)
	return n > 0, err
}

func (s *Store) ListBuyerOrders(ctx context.Context, buyerID string, limit int, cursorAt *time.Time, cursorID string) ([]domain.Order, error) {
	var rows pgx.Rows
	var err error
	if cursorAt == nil {
		rows, err = query(ctx, s, `SELECT `+orderCols+` FROM orders WHERE buyer_user_id=$1 ORDER BY created_at DESC, id DESC LIMIT $2`, buyerID, limit)
	} else {
		rows, err = query(ctx, s, `SELECT `+orderCols+` FROM orders WHERE buyer_user_id=$1 AND (created_at, id) < ($2, $3) ORDER BY created_at DESC, id DESC LIMIT $4`, buyerID, *cursorAt, cursorID, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Order
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

func (s *Store) InsertItem(ctx context.Context, it domain.Item) error {
	_, err := exec(ctx, s, `INSERT INTO order_items (id,order_id,ticket_type_id,ticket_type_name,section_name,seat_label,event_seat_id,unit_price_rupiah,quantity,line_total_rupiah)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		it.ID, it.OrderID, it.TicketTypeID, it.TicketTypeName, it.SectionName, it.SeatLabel, it.EventSeatID, it.UnitPriceRupiah, it.Quantity, it.LineTotalRupiah)
	return mapErr(err)
}

func (s *Store) InsertReservation(ctx context.Context, r domain.Reservation) error {
	_, err := exec(ctx, s, `INSERT INTO inventory_reservations (id,order_id,order_item_id,ticket_type_id,event_seat_id,quantity,expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`, r.ID, r.OrderID, r.OrderItemID, r.TicketTypeID, r.EventSeatID, r.Quantity, r.ExpiresAt)
	return mapErr(err)
}

func (s *Store) ListActiveReservations(ctx context.Context, orderID string) ([]domain.Reservation, error) {
	rows, err := query(ctx, s, `SELECT id,order_id,order_item_id,ticket_type_id,event_seat_id,quantity,expires_at,released_at,release_reason FROM inventory_reservations WHERE order_id=$1 AND released_at IS NULL`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Reservation
	for rows.Next() {
		var r domain.Reservation
		if err := rows.Scan(&r.ID, &r.OrderID, &r.OrderItemID, &r.TicketTypeID, &r.EventSeatID, &r.Quantity, &r.ExpiresAt, &r.ReleasedAt, &r.ReleaseReason); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) ReleaseReservation(ctx context.Context, id string, at time.Time, reason string) error {
	tag, err := exec(ctx, s, `UPDATE inventory_reservations SET released_at=$2, release_reason=$3 WHERE id=$1 AND released_at IS NULL`, id, at, reason)
	if err != nil {
		return err
	}
	if cmd, ok := tag.(pgconn.CommandTag); ok && cmd.RowsAffected() == 0 {
		return nil
	}
	return nil
}

func (s *Store) ClaimIdempotency(ctx context.Context, rec domain.Idempotency) (domain.Idempotency, bool, error) {
	_, err := exec(ctx, s, `INSERT INTO idempotency_keys (id,actor_user_id,scope,key_hash,request_hash,status,expires_at,created_at,updated_at)
		VALUES ($1,$2,$3,$4,$5,'PROCESSING', transaction_timestamp() + INTERVAL '24 hours', transaction_timestamp(), transaction_timestamp())
		ON CONFLICT (actor_user_id, scope, key_hash) DO NOTHING`, rec.ID, rec.ActorUserID, rec.Scope, rec.KeyHash, rec.RequestHash)
	if err != nil {
		return domain.Idempotency{}, false, mapErr(err)
	}
	out, err := scanIdem(rowQ(ctx, s, `SELECT id,actor_user_id,scope,key_hash,request_hash,status::text,resource_type,resource_id,http_status,response_body,expires_at FROM idempotency_keys WHERE actor_user_id=$1 AND scope=$2 AND key_hash=$3 FOR UPDATE`, rec.ActorUserID, rec.Scope, rec.KeyHash))
	if err != nil {
		return domain.Idempotency{}, false, err
	}
	return out, out.ID == rec.ID && out.Status == domain.IdempotencyProc, nil
}

func (s *Store) CompleteIdempotency(ctx context.Context, actor, keyHash string, httpStatus int, resourceID string, body []byte) error {
	_, err := exec(ctx, s, `UPDATE idempotency_keys SET status='COMPLETED', resource_type='Order', resource_id=$4, http_status=$5, response_body=$6::jsonb, updated_at=CURRENT_TIMESTAMP
		WHERE actor_user_id=$1 AND scope=$2 AND key_hash=$3 AND status='PROCESSING'`, actor, domain.ScopeCreateOrder, keyHash, resourceID, httpStatus, jsonText(body))
	return err
}

func jsonText(b []byte) any {
	if len(b) == 0 {
		return "{}"
	}
	return string(b)
}

func (s *Store) GetLoyalty(ctx context.Context, buyerID, orgID string) (loyaltydomain.Account, error) {
	return scanAcc(rowQ(ctx, s, `SELECT id,buyer_user_id,organizer_profile_id,balance_points,debt_points,reserved_points,version FROM loyalty_accounts WHERE buyer_user_id=$1 AND organizer_profile_id=$2`, buyerID, orgID))
}

func (s *Store) GetLoyaltyForUpdate(ctx context.Context, buyerID, orgID string) (loyaltydomain.Account, error) {
	return scanAcc(rowQ(ctx, s, `SELECT id,buyer_user_id,organizer_profile_id,balance_points,debt_points,reserved_points,version FROM loyalty_accounts WHERE buyer_user_id=$1 AND organizer_profile_id=$2 FOR UPDATE`, buyerID, orgID))
}

func (s *Store) UpsertLoyaltyForUpdate(ctx context.Context, buyerID, orgID string) (loyaltydomain.Account, error) {
	id, err := platdb.NewID()
	if err != nil {
		return loyaltydomain.Account{}, err
	}
	_, err = exec(ctx, s, `INSERT INTO loyalty_accounts (id,buyer_user_id,organizer_profile_id) VALUES ($1,$2,$3) ON CONFLICT (buyer_user_id, organizer_profile_id) DO NOTHING`, id, buyerID, orgID)
	if err != nil {
		return loyaltydomain.Account{}, err
	}
	return s.GetLoyaltyForUpdate(ctx, buyerID, orgID)
}

func (s *Store) ReservePoints(ctx context.Context, acc loyaltydomain.Account, orderID string, points, discount int64) error {
	tag, err := exec(ctx, s, `UPDATE loyalty_accounts SET reserved_points = reserved_points + $2, updated_at=CURRENT_TIMESTAMP, version=version+1
		WHERE id=$1 AND balance_points - reserved_points - debt_points >= $2`, acc.ID, points)
	if err != nil {
		return err
	}
	if cmd, ok := tag.(pgconn.CommandTag); ok && cmd.RowsAffected() == 0 {
		return loyaltydomain.ErrInsufficient
	}
	rid, err := platdb.NewID()
	if err != nil {
		return err
	}
	_, err = exec(ctx, s, `INSERT INTO loyalty_point_reservations (id,account_id,order_id,points,discount_rupiah,status) VALUES ($1,$2,$3,$4,$5,'ACTIVE')`, rid, acc.ID, orderID, points, discount)
	return mapErr(err)
}

func (s *Store) ReleasePoints(ctx context.Context, orderID, reason string) (bool, error) {
	var points int64
	var accountID string
	err := rowQ(ctx, s, `UPDATE loyalty_point_reservations SET status='RELEASED', release_reason=$2::loyalty_release_reason, released_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1
		WHERE order_id=$1 AND status='ACTIVE' RETURNING points, account_id`, orderID, reason).Scan(&points, &accountID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	_, err = exec(ctx, s, `UPDATE loyalty_accounts SET reserved_points = reserved_points - $2, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=$1 AND reserved_points >= $2`, accountID, points)
	return true, err
}

func (s *Store) ListDuePending(ctx context.Context, now time.Time, limit int) ([]domain.Order, error) {
	_ = now
	rows, err := query(ctx, s, `SELECT `+orderCols+` FROM orders WHERE status='PENDING' AND expires_at <= statement_timestamp() ORDER BY expires_at, id FOR UPDATE SKIP LOCKED LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Order
	for rows.Next() {
		o, err := scanOrder(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

func (s *Store) ListPendingByEvent(ctx context.Context, eventID string) ([]domain.Order, error) {
	rows, err := query(ctx, s, `SELECT `+orderCols+` FROM orders WHERE event_id=$1 AND status='PENDING' ORDER BY id FOR UPDATE`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Order
	for rows.Next() {
		o, err := scanOrder(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

func scanEvent(row interface{ Scan(dest ...any) error }) (eventdomain.Event, error) {
	var e eventdomain.Event
	var status, mode string
	err := row.Scan(&e.ID, &e.OrganizerProfileID, &e.Slug, &e.Title, &e.Description, &e.Category, &e.VenueName, &e.AddressLine, &e.City, &e.Province, &e.Timezone, &e.StartsAt, &e.EndsAt, &e.Terms, &e.ContactEmail, &e.ContactPhone, &status, &mode, &e.SubmittedAt, &e.ModerationReason, &e.DecidedAt, &e.DecidedByUserID, &e.PublishedAt, &e.CancelledAt, &e.CancelledByUserID, &e.CancellationReason, &e.CompletedAt, &e.CreatedAt, &e.UpdatedAt, &e.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		return eventdomain.Event{}, eventdomain.ErrNotFound
	}
	e.Status = eventdomain.Status(status)
	e.InventoryMode = eventdomain.InventoryMode(mode)
	return e, err
}

func scanTicket(row interface{ Scan(dest ...any) error }) (eventdomain.TicketType, error) {
	var t eventdomain.TicketType
	err := row.Scan(&t.ID, &t.EventID, &t.Name, &t.Description, &t.PriceRupiah, &t.Quota, &t.MaxPerAccount, &t.SaleStartsAt, &t.SaleEndsAt, &t.SortOrder, &t.SalesStoppedAt, &t.SalesStoppedByUserID, &t.SalesStopReason, &t.CreatedAt, &t.UpdatedAt, &t.Version, &t.ReservedQuantity, &t.PaidQuantity)
	if errors.Is(err, pgx.ErrNoRows) {
		return eventdomain.TicketType{}, domain.ErrCheckoutInvalid
	}
	return t, err
}

func scanOrder(row interface{ Scan(dest ...any) error }) (domain.Order, error) {
	var o domain.Order
	var status string
	err := row.Scan(&o.ID, &o.OrderNumber, &o.BuyerUserID, &o.EventID, &status, &o.Currency, &o.SubtotalRupiah, &o.LoyaltyDiscountRupiah, &o.TotalPayableRupiah, &o.LoyaltyAccountID, &o.RedeemedPoints, &o.LoyaltyEarnedPoints, &o.LoyaltyReversedPoints, &o.LoyaltyRedeemedRestored, &o.ExpiresAt, &o.ExpiredAt, &o.CancelledAt, &o.CancellationReason, &o.CreatedAt, &o.UpdatedAt, &o.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Order{}, domain.ErrNotFound
	}
	o.Status = domain.Status(status)
	return o, err
}

func scanIdem(row interface{ Scan(dest ...any) error }) (domain.Idempotency, error) {
	var rec domain.Idempotency
	err := row.Scan(&rec.ID, &rec.ActorUserID, &rec.Scope, &rec.KeyHash, &rec.RequestHash, &rec.Status, &rec.ResourceType, &rec.ResourceID, &rec.HTTPStatus, &rec.ResponseBody, &rec.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Idempotency{}, domain.ErrConflict
	}
	return rec, err
}

func scanAcc(row interface{ Scan(dest ...any) error }) (loyaltydomain.Account, error) {
	var a loyaltydomain.Account
	err := row.Scan(&a.ID, &a.BuyerUserID, &a.OrganizerProfileID, &a.BalancePoints, &a.DebtPoints, &a.ReservedPoints, &a.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		return loyaltydomain.Account{}, loyaltydomain.ErrAccountNotFound
	}
	return a, err
}

func mapErr(err error) error {
	if err == nil {
		return nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505":
			if strings.Contains(pgErr.ConstraintName, "seat") {
				return domain.ErrSeatUnavailable
			}
			if strings.Contains(pgErr.ConstraintName, "identity") {
				return domain.ErrAttendeeDuplicate
			}
			return domain.ErrConflict
		case "23514":
			return domain.ErrInventory
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
