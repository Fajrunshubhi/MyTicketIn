package application

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	analyticsapp "myticketin/internal/modules/analytics/application"
	auditdomain "myticketin/internal/modules/audit/domain"
	authapp "myticketin/internal/modules/auth/application"
	authdomain "myticketin/internal/modules/auth/domain"
	eventdomain "myticketin/internal/modules/events/domain"
	loyaltydomain "myticketin/internal/modules/loyalty/domain"
	"myticketin/internal/modules/orders/domain"
	orgdomain "myticketin/internal/modules/organizers/domain"
	"myticketin/internal/platform/db"
	"myticketin/internal/platform/logger"
)

type Store interface {
	GetEvent(ctx context.Context, id string) (eventdomain.Event, error)
	GetEventForUpdate(ctx context.Context, id string) (eventdomain.Event, error)
	ListTickets(ctx context.Context, eventID string) ([]eventdomain.TicketType, error)
	ListSections(ctx context.Context, eventID string) ([]eventdomain.Section, error)
	ListSeats(ctx context.Context, eventID string) ([]eventdomain.Seat, error)
	LockTickets(ctx context.Context, ids []string) ([]eventdomain.TicketType, error)
	IncrementReserved(ctx context.Context, ticketID string, n int) error
	IncrementPaid(ctx context.Context, ticketID string, n int) error
	ConsumeLoyaltyReservation(ctx context.Context, orderID string) (points int64, accountID string, ok bool, err error)
	AdjustLoyaltyAccount(ctx context.Context, acc loyaltydomain.Account) error
	InsertLedger(ctx context.Context, accountID, entryType string, delta int64, sourceKey, orderID string, refundID *string, balanceAfter, debtAfter int64, corr string) error
	MarkOrderPaid(ctx context.Context, o domain.Order, earned int64, now time.Time) error
	MarkOrderRefunded(ctx context.Context, o domain.Order, now time.Time) error
	DecrementReserved(ctx context.Context, ticketID string, n int) error
	SeatHeld(ctx context.Context, seatID string) (bool, error)
	GetSeat(ctx context.Context, id string) (eventdomain.Seat, error)
	ListHeldSeatIDs(ctx context.Context, eventID string) ([]string, error)
	AccountUnits(ctx context.Context, buyerID, eventID, ticketTypeID string) (int, error)
	InsertOrder(ctx context.Context, o *domain.Order) error
	UpdateOrder(ctx context.Context, o domain.Order, expected int) error
	GetOrder(ctx context.Context, id string) (domain.Order, error)
	GetOrderForUpdate(ctx context.Context, id string) (domain.Order, error)
	ListBuyerOrders(ctx context.Context, buyerID string, limit int, cursorAt *time.Time, cursorID string) ([]domain.Order, error)
	InsertItem(ctx context.Context, it domain.Item) error
	InsertAttendees(ctx context.Context, eventID string, it domain.Item) error
	IdentityTaken(ctx context.Context, eventID, identityNumber, excludeOrderID string) (bool, error)
	InsertReservation(ctx context.Context, r domain.Reservation) error
	ListActiveReservations(ctx context.Context, orderID string) ([]domain.Reservation, error)
	ReleaseReservation(ctx context.Context, id string, at time.Time, reason string) error
	ClaimIdempotency(ctx context.Context, rec domain.Idempotency) (domain.Idempotency, bool, error)
	CompleteIdempotency(ctx context.Context, actor, keyHash string, httpStatus int, resourceID string, body []byte) error
	GetLoyalty(ctx context.Context, buyerID, orgID string) (loyaltydomain.Account, error)
	GetLoyaltyForUpdate(ctx context.Context, buyerID, orgID string) (loyaltydomain.Account, error)
	UpsertLoyaltyForUpdate(ctx context.Context, buyerID, orgID string) (loyaltydomain.Account, error)
	ReservePoints(ctx context.Context, acc loyaltydomain.Account, orderID string, points, discount int64) error
	ReleasePoints(ctx context.Context, orderID, reason string) (bool, error)
	ListDuePending(ctx context.Context, now time.Time, limit int) ([]domain.Order, error)
	ListPendingByEvent(ctx context.Context, eventID string) ([]domain.Order, error)
}

type ProfileReader interface {
	GetByID(ctx context.Context, id string) (orgdomain.Profile, error)
}

type Auditor interface {
	Record(ctx context.Context, rec auditdomain.Record) error
}

type Analytics interface {
	Emit(ctx context.Context, in analyticsapp.Input) error
}

type Limiter interface {
	Hit(ctx context.Context, keyHash, scope string, window time.Duration) (int, error)
}

type TicketIssuer interface {
	IssueForPaidOrder(ctx context.Context, order domain.Order, corr string) error
}

type TicketRefundCanceller interface {
	CancelUnusedForRefund(ctx context.Context, orderID, refundID string) error
}

type Service struct {
	Store     Store
	Profiles  ProfileReader
	Audit     Auditor
	Analytics Analytics
	Rates     Limiter
	HashKey   func(raw string) string
	Issuer    TicketIssuer
	Tickets   TicketRefundCanceller
	UoW       func(ctx context.Context, fn func(context.Context) error) error
	Now       func() time.Time
	BuyerGate func(ctx context.Context, actor authdomain.User) error
}

func NewService(store Store) *Service {
	return &Service{Store: store, Now: func() time.Time { return time.Now().UTC() }}
}

type Summary struct {
	Event                 map[string]any   `json:"event"`
	Items                 []map[string]any `json:"items"`
	SubtotalRupiah        int64            `json:"subtotalRupiah"`
	RequestedRedeemPoints int64            `json:"requestedRedeemPoints"`
	AppliedRedeemPoints   int64            `json:"appliedRedeemPoints"`
	LoyaltyDiscountRupiah int64            `json:"loyaltyDiscountRupiah"`
	TotalPayableRupiah    int64            `json:"totalPayableRupiah"`
	Currency              string           `json:"currency"`
	ReservationMinutes    int              `json:"reservationMinutes"`
	AvailablePoints       int64            `json:"availablePoints"`
	MaxRedeemablePoints   int64            `json:"maxRedeemablePoints"`
	OrganizerName         string           `json:"organizerName"`
	CashValue             bool             `json:"cashValue"`
	Sandbox               bool             `json:"sandbox"`
}

type OrderView struct {
	ID                    string           `json:"id"`
	OrderNumber           string           `json:"orderNumber"`
	Status                domain.Status    `json:"status"`
	Event                 map[string]any   `json:"event,omitempty"`
	Items                 []map[string]any `json:"items"`
	SubtotalRupiah        int64            `json:"subtotalRupiah"`
	RedeemedPoints        int64            `json:"redeemedPoints"`
	LoyaltyDiscountRupiah int64            `json:"loyaltyDiscountRupiah"`
	TotalPayableRupiah    int64            `json:"totalPayableRupiah"`
	Currency              string           `json:"currency"`
	ExpiresAt             string           `json:"expiresAt"`
	ServerTime            string           `json:"serverTime"`
}

func (s *Service) Summarize(ctx context.Context, actor authdomain.User, in domain.CheckoutInput, ip string) (Summary, error) {
	if err := s.requireBuyer(ctx, actor); err != nil {
		return Summary{}, err
	}
	if err := s.limit(ctx, "checkout-summary", actor.ID, ip, 30, time.Minute); err != nil {
		return Summary{}, err
	}
	in, err := domain.NormalizeCheckout(in)
	if err != nil {
		return Summary{}, err
	}
	now := s.Now()
	e, err := s.Store.GetEvent(ctx, in.EventID)
	if err != nil {
		return Summary{}, domain.ErrNotPurchasable
	}
	plan, err := s.plan(ctx, actor.ID, e, in, now, false)
	if err != nil {
		return Summary{}, err
	}
	orgName := ""
	if s.Profiles != nil {
		if p, err := s.Profiles.GetByID(ctx, e.OrganizerProfileID); err == nil {
			orgName = p.Name
		}
	}
	avail := int64(0)
	if acc, err := s.Store.GetLoyalty(ctx, actor.ID, e.OrganizerProfileID); err == nil {
		avail = loyaltydomain.AvailablePoints(acc.BalancePoints, acc.ReservedPoints, acc.DebtPoints)
	}
	applied, discount, err := loyaltydomain.ApplyRedeem(in.RedeemPoints, plan.subtotal, avail)
	if err != nil {
		return Summary{}, err
	}
	s.emit(ctx, "checkout_started", actor.ID, e.ID)
	return Summary{
		Event: map[string]any{"id": e.ID, "title": e.Title, "slug": e.Slug, "timezone": e.Timezone, "organizerProfileId": e.OrganizerProfileID},
		Items: plan.items, SubtotalRupiah: plan.subtotal, RequestedRedeemPoints: in.RedeemPoints,
		AppliedRedeemPoints: applied, LoyaltyDiscountRupiah: discount, TotalPayableRupiah: plan.subtotal - discount,
		Currency: "IDR", ReservationMinutes: 15, AvailablePoints: avail, MaxRedeemablePoints: loyaltydomain.MaxRedeemablePoints(plan.subtotal),
		OrganizerName: orgName, CashValue: false, Sandbox: true,
	}, nil
}

func (s *Service) Create(ctx context.Context, actor authdomain.User, in domain.CheckoutInput, idemKey, ip string) (OrderView, bool, error) {
	if err := s.requireBuyer(ctx, actor); err != nil {
		return OrderView{}, false, err
	}
	if err := s.limit(ctx, "create-order", actor.ID, ip, 10, time.Minute); err != nil {
		return OrderView{}, false, err
	}
	if err := domain.ValidateIdempotencyKey(idemKey); err != nil {
		return OrderView{}, false, err
	}
	in, err := domain.NormalizeCheckout(in)
	if err != nil {
		return OrderView{}, false, err
	}
	if !in.Confirmed {
		return OrderView{}, false, domain.ErrCheckoutInvalid
	}
	reqHash, err := domain.CanonicalHash(in)
	if err != nil {
		return OrderView{}, false, err
	}
	keyHash := sha256Hex(idemKey)
	var view OrderView
	replay := false
	err = s.retryTx(ctx, func(ctx context.Context) error {
		now := s.Now()
		claimID, err := db.NewID()
		if err != nil {
			return err
		}
		claimed, created, err := s.Store.ClaimIdempotency(ctx, domain.Idempotency{
			ID: claimID, ActorUserID: actor.ID, Scope: domain.ScopeCreateOrder, KeyHash: keyHash, RequestHash: reqHash,
			Status: domain.IdempotencyProc, ExpiresAt: now.Add(domain.IdempotencyTTL),
		})
		if err != nil {
			return err
		}
		if !created {
			if claimed.RequestHash != reqHash {
				return domain.ErrKeyReused
			}
			if claimed.Status == domain.IdempotencyProc {
				return domain.ErrKeyInProgress
			}
			if claimed.ResourceID != nil {
				o, err := s.Store.GetOrder(ctx, *claimed.ResourceID)
				if err != nil {
					return err
				}
				view, err = s.view(ctx, o, now)
				replay = true
				return err
			}
			return domain.ErrKeyInProgress
		}
		e, err := s.Store.GetEventForUpdate(ctx, in.EventID)
		if err != nil {
			return domain.ErrNotPurchasable
		}
		plan, err := s.plan(ctx, actor.ID, e, in, now, true)
		if err != nil {
			return err
		}
		if err := domain.RequireHolders(in); err != nil {
			return err
		}
		var acc loyaltydomain.Account
		applied, discount := int64(0), int64(0)
		if in.RedeemPoints > 0 {
			acc, err = s.Store.UpsertLoyaltyForUpdate(ctx, actor.ID, e.OrganizerProfileID)
			if err != nil {
				return err
			}
			if acc.OrganizerProfileID != e.OrganizerProfileID {
				return loyaltydomain.ErrOrganizerMismatch
			}
			avail := loyaltydomain.AvailablePoints(acc.BalancePoints, acc.ReservedPoints, acc.DebtPoints)
			applied, discount, err = loyaltydomain.ApplyRedeem(in.RedeemPoints, plan.subtotal, avail)
			if err != nil {
				return err
			}
		}
		ids := uniqueTicketIDs(plan)
		sort.Strings(ids)
		locked, err := s.Store.LockTickets(ctx, ids)
		if err != nil {
			return err
		}
		byID := map[string]eventdomain.TicketType{}
		for _, t := range locked {
			byID[t.ID] = t
		}
		for _, row := range plan.raw {
			t := byID[row.ticketID]
			if t.PriceRupiah != row.unit {
				return domain.ErrPriceChanged
			}
			if domain.Remaining(t.Quota, t.ReservedQuantity, t.PaidQuantity) < row.qty {
				return domain.ErrInventory
			}
		}
		for _, a := range domain.AllAttendees(in) {
			taken, err := s.Store.IdentityTaken(ctx, e.ID, a.IdentityNumber, "")
			if err != nil {
				return err
			}
			if taken {
				return domain.ErrAttendeeDuplicate
			}
		}
		for _, seatID := range in.SeatIDs {
			held, err := s.Store.SeatHeld(ctx, seatID)
			if err != nil {
				return err
			}
			if held {
				return domain.ErrSeatUnavailable
			}
			if _, err := s.Store.GetSeat(ctx, seatID); err != nil {
				return domain.ErrSeatUnavailable
			}
		}
		oid, err := db.NewID()
		if err != nil {
			return err
		}
		createdAt := now
		expires := createdAt.Add(domain.HoldDuration)
		var accID *string
		if applied > 0 {
			accID = &acc.ID
		}
		o := domain.Order{
			ID: oid, OrderNumber: orderNumber(oid), BuyerUserID: actor.ID, EventID: e.ID, Status: domain.StatusPending,
			Currency: "IDR", SubtotalRupiah: plan.subtotal, LoyaltyDiscountRupiah: discount, TotalPayableRupiah: plan.subtotal - discount,
			LoyaltyAccountID: accID, RedeemedPoints: applied, ExpiresAt: expires, CreatedAt: createdAt, UpdatedAt: createdAt, Version: 1,
		}
		if err := s.Store.InsertOrder(ctx, &o); err != nil {
			return err
		}
		expires = o.ExpiresAt
		for _, row := range plan.raw {
			iid, err := db.NewID()
			if err != nil {
				return err
			}
			it := domain.Item{
				ID: iid, OrderID: oid, TicketTypeID: row.ticketID, TicketTypeName: row.name,
				SectionName: row.section, SeatLabel: row.seatLabel, EventSeatID: row.seatID,
				UnitPriceRupiah: row.unit, Quantity: row.qty, LineTotalRupiah: row.unit * int64(row.qty),
				Attendees: row.attendees,
			}
			if err := s.Store.InsertItem(ctx, it); err != nil {
				return err
			}
			if err := s.Store.InsertAttendees(ctx, e.ID, it); err != nil {
				return err
			}
			rid, err := db.NewID()
			if err != nil {
				return err
			}
			if err := s.Store.InsertReservation(ctx, domain.Reservation{
				ID: rid, OrderID: oid, OrderItemID: iid, TicketTypeID: row.ticketID, EventSeatID: row.seatID,
				Quantity: row.qty, ExpiresAt: expires,
			}); err != nil {
				return err
			}
			if err := s.Store.IncrementReserved(ctx, row.ticketID, row.qty); err != nil {
				return err
			}
			o.Items = append(o.Items, it)
		}
		if applied > 0 {
			if err := s.Store.ReservePoints(ctx, acc, oid, applied, discount); err != nil {
				return err
			}
		}
		view, err = s.view(ctx, o, now)
		if err != nil {
			return err
		}
		body, _ := json.Marshal(map[string]any{"order": view})
		if err := s.Store.CompleteIdempotency(ctx, actor.ID, keyHash, 201, oid, body); err != nil {
			return err
		}
		return s.record(ctx, actor.ID, "order.created", oid, nil, map[string]any{"status": "PENDING", "eventId": e.ID})
	})
	if err != nil {
		return OrderView{}, false, err
	}
	if !replay {
		s.emit(ctx, "order_created", actor.ID, view.ID)
	}
	return view, replay, nil
}

func (s *Service) Get(ctx context.Context, actor authdomain.User, id string) (OrderView, error) {
	if !actor.IsActive() {
		return OrderView{}, authdomain.ErrForbidden
	}
	o, err := s.Store.GetOrder(ctx, id)
	if err != nil {
		return OrderView{}, domain.ErrNotFound
	}
	if o.BuyerUserID != actor.ID && actor.Role != authdomain.RoleAdmin {
		return OrderView{}, domain.ErrNotFound
	}
	if actor.Role == authdomain.RoleAdmin && o.BuyerUserID != actor.ID {
		_ = s.record(ctx, actor.ID, "order.admin_view", o.ID, nil, map[string]any{"status": string(o.Status)})
	}
	return s.view(ctx, o, s.Now())
}

func (s *Service) List(ctx context.Context, actor authdomain.User, cursor string, limit int) ([]OrderView, string, error) {
	if err := s.requireBuyer(ctx, actor); err != nil {
		return nil, "", err
	}
	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		return nil, "", domain.ErrCheckoutInvalid
	}
	var cursorAt *time.Time
	cursorID := ""
	if cursor != "" {
		t, id, err := decodeCursor(cursor)
		if err != nil {
			return nil, "", domain.ErrCheckoutInvalid
		}
		cursorAt, cursorID = &t, id
	}
	rows, err := s.Store.ListBuyerOrders(ctx, actor.ID, limit+1, cursorAt, cursorID)
	if err != nil {
		return nil, "", err
	}
	now := s.Now()
	next := ""
	if len(rows) > limit {
		last := rows[limit-1]
		next = encodeCursor(last.CreatedAt, last.ID)
		rows = rows[:limit]
	}
	out := make([]OrderView, 0, len(rows))
	for _, o := range rows {
		v, err := s.view(ctx, o, now)
		if err != nil {
			return nil, "", err
		}
		out = append(out, v)
	}
	return out, next, nil
}

func (s *Service) LoyaltyAccount(ctx context.Context, actor authdomain.User, organizerID string) (map[string]any, error) {
	if err := s.requireBuyer(ctx, actor); err != nil {
		return nil, err
	}
	organizerID = strings.TrimSpace(organizerID)
	if organizerID == "" {
		return nil, loyaltydomain.ErrAccountNotFound
	}
	name := ""
	if s.Profiles != nil {
		p, err := s.Profiles.GetByID(ctx, organizerID)
		if err != nil {
			return nil, domain.ErrNotFound
		}
		name = p.Name
	}
	avail, bal, debt, reserved := int64(0), int64(0), int64(0), int64(0)
	if acc, err := s.Store.GetLoyalty(ctx, actor.ID, organizerID); err == nil {
		bal, debt, reserved = acc.BalancePoints, acc.DebtPoints, acc.ReservedPoints
		avail = loyaltydomain.AvailablePoints(bal, reserved, debt)
	}
	return map[string]any{
		"organizer":     map[string]any{"id": organizerID, "name": name},
		"balancePoints": bal, "debtPoints": debt, "reservedPoints": reserved, "availablePoints": avail,
		"rate": map[string]any{"rupiahPerPoint": 10, "maxCheckoutPercent": 20}, "cashValue": false, "sandbox": true,
	}, nil
}

type ExpireResult struct {
	Scanned              int   `json:"scanned"`
	Expired              int   `json:"expired"`
	ReleasedReservations int   `json:"releasedReservations"`
	HasMore              bool  `json:"hasMore"`
	DurationMs           int64 `json:"durationMs"`
}

func (s *Service) ExpireDue(ctx context.Context, batch int) (ExpireResult, error) {
	start := time.Now()
	if batch <= 0 {
		batch = 100
	}
	if batch > 500 {
		batch = 500
	}
	var result ExpireResult
	err := s.retryTx(ctx, func(ctx context.Context) error {
		now := s.Now()
		due, err := s.Store.ListDuePending(ctx, now, batch)
		if err != nil {
			return err
		}
		result.Scanned = len(due)
		result.HasMore = len(due) == batch
		for _, o := range due {
			n, err := s.releaseLocked(ctx, o, domain.StatusExpired, domain.ReleaseExpired, loyaltydomain.ReleaseOrderExpired, now, "")
			if err != nil {
				return err
			}
			if n >= 0 {
				result.Expired++
				result.ReleasedReservations += n
				s.emit(ctx, "order_expired", "", o.ID)
			}
		}
		return nil
	})
	result.DurationMs = time.Since(start).Milliseconds()
	return result, err
}

func (s *Service) CancelPendingForEvent(ctx context.Context, eventID, reason string) error {
	return s.retryTx(ctx, func(ctx context.Context) error {
		now := s.Now()
		list, err := s.Store.ListPendingByEvent(ctx, eventID)
		if err != nil {
			return err
		}
		for _, o := range list {
			if _, err := s.releaseLocked(ctx, o, domain.StatusCancelled, domain.ReleaseCancelled, loyaltydomain.ReleaseEventCancelled, now, reason); err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *Service) releaseLocked(ctx context.Context, o domain.Order, to domain.Status, invReason, loyReason string, now time.Time, cancelReason string) (int, error) {
	cur, err := s.Store.GetOrderForUpdate(ctx, o.ID)
	if err != nil {
		return -1, err
	}
	if cur.Status != domain.StatusPending {
		return -1, nil
	}
	if cur.LoyaltyAccountID != nil {
		if ev, err := s.Store.GetEvent(ctx, cur.EventID); err == nil {
			_, _ = s.Store.GetLoyaltyForUpdate(ctx, cur.BuyerUserID, ev.OrganizerProfileID)
		}
	}
	res, err := s.Store.ListActiveReservations(ctx, cur.ID)
	if err != nil {
		return 0, err
	}
	ids := map[string]struct{}{}
	for _, r := range res {
		ids[r.TicketTypeID] = struct{}{}
	}
	var sorted []string
	for id := range ids {
		sorted = append(sorted, id)
	}
	sort.Strings(sorted)
	if _, err := s.Store.LockTickets(ctx, sorted); err != nil && len(sorted) > 0 {
		return 0, err
	}
	released := 0
	for _, r := range res {
		if err := s.Store.ReleaseReservation(ctx, r.ID, now, invReason); err != nil {
			return 0, err
		}
		if err := s.Store.DecrementReserved(ctx, r.TicketTypeID, r.Quantity); err != nil {
			return 0, err
		}
		released++
	}
	if _, err := s.Store.ReleasePoints(ctx, cur.ID, loyReason); err != nil {
		return 0, err
	}
	next := cur
	next.Status = to
	next.UpdatedAt = now
	if to == domain.StatusExpired {
		next.ExpiredAt = &now
	}
	if to == domain.StatusFailed {
		next.Status = domain.StatusFailed
	}
	if to == domain.StatusCancelled {
		next.CancelledAt = &now
		r := cancelReason
		if r == "" {
			r = "Cancelled"
		}
		next.CancellationReason = &r
	}
	if err := s.Store.UpdateOrder(ctx, next, cur.Version); err != nil {
		return 0, err
	}
	action := "order.expired"
	if to == domain.StatusCancelled {
		action = "order.cancelled"
	}
	if err := s.recordSystem(ctx, action, cur.ID, map[string]any{"status": "PENDING"}, map[string]any{"status": string(to)}); err != nil {
		return 0, err
	}
	return released, nil
}

func (s *Service) ExpireIfPendingInTx(ctx context.Context, orderID string, now time.Time) error {
	return s.releasePendingInTx(ctx, orderID, domain.StatusExpired, domain.ReleaseExpired, loyaltydomain.ReleaseOrderExpired, now)
}

func (s *Service) FailIfPendingInTx(ctx context.Context, orderID string, now time.Time, paymentExpired bool) error {
	inv, loy := domain.ReleaseExpired, loyaltydomain.ReleasePaymentFailed
	to := domain.StatusFailed
	if paymentExpired {
		loy = loyaltydomain.ReleasePaymentExpired
		to = domain.StatusExpired
		inv = domain.ReleaseExpired
	}
	return s.releasePendingInTx(ctx, orderID, to, inv, loy, now)
}

func (s *Service) releasePendingInTx(ctx context.Context, orderID string, to domain.Status, invReason, loyReason string, now time.Time) error {
	o, err := s.Store.GetOrderForUpdate(ctx, orderID)
	if err != nil {
		return err
	}
	_, err = s.releaseLocked(ctx, o, to, invReason, loyReason, now, "")
	return err
}

func (s *Service) ConvertToPaidInTx(ctx context.Context, orderID string, now time.Time, corr string) (int64, error) {
	o, err := s.Store.GetOrderForUpdate(ctx, orderID)
	if err != nil {
		return 0, err
	}
	if o.Status != domain.StatusPending {
		return 0, domain.ErrConflict
	}
	if !now.Before(o.ExpiresAt) {
		return 0, domain.ErrExpired
	}
	ev, err := s.Store.GetEvent(ctx, o.EventID)
	if err != nil {
		return 0, err
	}
	acc, err := s.Store.UpsertLoyaltyForUpdate(ctx, o.BuyerUserID, ev.OrganizerProfileID)
	if err != nil {
		return 0, err
	}
	if o.LoyaltyAccountID != nil && *o.LoyaltyAccountID != acc.ID {
		return 0, loyaltydomain.ErrConflict
	}
	res, err := s.Store.ListActiveReservations(ctx, o.ID)
	if err != nil {
		return 0, err
	}
	if len(res) == 0 {
		return 0, domain.ErrConflict
	}
	ids := map[string]struct{}{}
	for _, r := range res {
		ids[r.TicketTypeID] = struct{}{}
	}
	var sorted []string
	for id := range ids {
		sorted = append(sorted, id)
	}
	sort.Strings(sorted)
	if _, err := s.Store.LockTickets(ctx, sorted); err != nil {
		return 0, err
	}
	for _, r := range res {
		if err := s.Store.ReleaseReservation(ctx, r.ID, now, domain.ReleaseConverted); err != nil {
			return 0, err
		}
		if err := s.Store.IncrementPaid(ctx, r.TicketTypeID, r.Quantity); err != nil {
			return 0, err
		}
	}
	if o.RedeemedPoints > 0 {
		pts, accID, ok, err := s.Store.ConsumeLoyaltyReservation(ctx, o.ID)
		if err != nil {
			return 0, err
		}
		if !ok || pts != o.RedeemedPoints || accID != acc.ID {
			return 0, loyaltydomain.ErrConflict
		}
		if acc.ReservedPoints < pts || acc.BalancePoints < pts {
			return 0, loyaltydomain.ErrInsufficient
		}
		acc.ReservedPoints -= pts
		acc.BalancePoints -= pts
		if err := s.Store.AdjustLoyaltyAccount(ctx, acc); err != nil {
			return 0, err
		}
		if err := s.Store.InsertLedger(ctx, acc.ID, "REDEEM_DEBIT", -pts, "order:"+o.ID, o.ID, nil, acc.BalancePoints, acc.DebtPoints, corr); err != nil {
			return 0, err
		}
	}
	earned := o.TotalPayableRupiah / 1000
	if earned > 0 {
		acc.BalancePoints += earned
		if err := s.Store.AdjustLoyaltyAccount(ctx, acc); err != nil {
			return 0, err
		}
		if err := s.Store.InsertLedger(ctx, acc.ID, "EARN", earned, "order:"+o.ID, o.ID, nil, acc.BalancePoints, acc.DebtPoints, corr); err != nil {
			return 0, err
		}
	}
	if err := s.Store.MarkOrderPaid(ctx, o, earned, now); err != nil {
		return 0, err
	}
	if err := s.record(ctx, o.BuyerUserID, "order.paid", o.ID, map[string]any{"status": "PENDING"}, map[string]any{"status": "PAID"}); err != nil {
		return 0, err
	}
	o.Status = domain.StatusPaid
	if s.Issuer != nil {
		if err := s.Issuer.IssueForPaidOrder(ctx, o, corr); err != nil {
			return 0, err
		}
	}
	return earned, nil
}

func (s *Service) ApplyCompletedRefundInTx(ctx context.Context, orderID, refundID string, cumulative int64, now time.Time, corr string) (int64, int64, bool, error) {
	o, err := s.Store.GetOrderForUpdate(ctx, orderID)
	if err != nil {
		return 0, 0, false, err
	}
	if o.Status != domain.StatusPaid && o.Status != domain.StatusRefunded {
		return 0, 0, false, domain.ErrConflict
	}
	ev, err := s.Store.GetEvent(ctx, o.EventID)
	if err != nil {
		return 0, 0, false, err
	}
	acc, err := s.Store.UpsertLoyaltyForUpdate(ctx, o.BuyerUserID, ev.OrganizerProfileID)
	if err != nil {
		return 0, 0, false, err
	}
	remaining := o.TotalPayableRupiah - cumulative
	if remaining < 0 {
		remaining = 0
	}
	target := o.LoyaltyEarnedPoints - remaining/1000
	if target < 0 {
		target = 0
	}
	if target > o.LoyaltyEarnedPoints {
		target = o.LoyaltyEarnedPoints
	}
	reversal := target - o.LoyaltyReversedPoints
	if reversal > 0 {
		acc.DebtPoints += reversal
		if err := s.Store.AdjustLoyaltyAccount(ctx, acc); err != nil {
			return 0, 0, false, err
		}
		rid := refundID
		if err := s.Store.InsertLedger(ctx, acc.ID, "EARN_REVERSAL", -reversal, "refund:"+refundID, o.ID, &rid, acc.BalancePoints, acc.DebtPoints, corr); err != nil {
			return 0, 0, false, err
		}
		o.LoyaltyReversedPoints = target
	}
	full := cumulative >= o.TotalPayableRupiah
	var restored int64
	if full && o.RedeemedPoints > 0 && !o.LoyaltyRedeemedRestored {
		acc.BalancePoints += o.RedeemedPoints
		if err := s.Store.AdjustLoyaltyAccount(ctx, acc); err != nil {
			return 0, 0, false, err
		}
		rid := refundID
		if err := s.Store.InsertLedger(ctx, acc.ID, "REDEEM_RESTORE", o.RedeemedPoints, "order:"+o.ID+":full-refund", o.ID, &rid, acc.BalancePoints, acc.DebtPoints, corr); err != nil {
			return 0, 0, false, err
		}
		o.LoyaltyRedeemedRestored = true
		restored = o.RedeemedPoints
	}
	if full {
		o.Status = domain.StatusRefunded
	}
	if err := s.Store.MarkOrderRefunded(ctx, o, now); err != nil {
		return 0, 0, false, err
	}
	after := map[string]any{"status": string(o.Status), "reversed": o.LoyaltyReversedPoints, "sandbox": true, "cashValue": false}
	if err := s.recordSystem(ctx, "order.refund.loyalty", o.ID, map[string]any{"status": "PAID"}, after); err != nil {
		return 0, 0, false, err
	}
	if full && s.Tickets != nil {
		if err := s.Tickets.CancelUnusedForRefund(ctx, o.ID, refundID); err != nil {
			return 0, 0, false, err
		}
	}
	return reversal, restored, full, nil
}

type planRow struct {
	ticketID  string
	name      string
	unit      int64
	qty       int
	section   *string
	seatLabel *string
	seatID    *string
	attendees []domain.AttendeeInput
}

type checkoutPlan struct {
	items    []map[string]any
	raw      []planRow
	subtotal int64
}

func (s *Service) plan(ctx context.Context, buyerID string, e eventdomain.Event, in domain.CheckoutInput, now time.Time, lockSeats bool) (checkoutPlan, error) {
	_ = buyerID
	_ = lockSeats
	if e.Status != eventdomain.StatusPublished || !now.Before(e.StartsAt) {
		return checkoutPlan{}, domain.ErrNotPurchasable
	}
	tickets, err := s.Store.ListTickets(ctx, e.ID)
	if err != nil {
		return checkoutPlan{}, err
	}
	byID := map[string]eventdomain.TicketType{}
	for _, t := range tickets {
		byID[t.ID] = t
	}
	secs, _ := s.Store.ListSections(ctx, e.ID)
	secByID := map[string]eventdomain.Section{}
	for _, sec := range secs {
		secByID[sec.ID] = sec
	}
	var rows []planRow
	switch e.InventoryMode {
	case eventdomain.ModeReserved:
		if len(in.SeatIDs) == 0 || len(in.Items) > 0 {
			return checkoutPlan{}, domain.ErrModeMismatch
		}
		if len(in.Attendees) > 0 && len(in.Attendees) != len(in.SeatIDs) {
			return checkoutPlan{}, domain.ErrCheckoutInvalid
		}
		for i, sid := range in.SeatIDs {
			seat, err := s.Store.GetSeat(ctx, sid)
			if err != nil || seat.EventID != e.ID {
				return checkoutPlan{}, domain.ErrSeatUnavailable
			}
			sec, ok := secByID[seat.SectionID]
			if !ok {
				return checkoutPlan{}, domain.ErrSeatUnavailable
			}
			t, ok := byID[sec.TicketTypeID]
			if !ok {
				return checkoutPlan{}, domain.ErrCheckoutInvalid
			}
			if err := eligible(e, t, now); err != nil {
				return checkoutPlan{}, err
			}
			sidCopy, lab, sn := sid, seat.Label, sec.Name
			var atts []domain.AttendeeInput
			if len(in.Attendees) == len(in.SeatIDs) {
				atts = []domain.AttendeeInput{in.Attendees[i]}
			}
			rows = append(rows, planRow{ticketID: t.ID, name: t.Name, unit: t.PriceRupiah, qty: 1, section: &sn, seatLabel: &lab, seatID: &sidCopy, attendees: atts})
		}
	default:
		if len(in.SeatIDs) > 0 || len(in.Items) == 0 {
			return checkoutPlan{}, domain.ErrModeMismatch
		}
		for _, it := range in.Items {
			t, ok := byID[it.TicketTypeID]
			if !ok || t.EventID != e.ID {
				return checkoutPlan{}, domain.ErrCheckoutInvalid
			}
			if err := eligible(e, t, now); err != nil {
				return checkoutPlan{}, err
			}
			if domain.Remaining(t.Quota, t.ReservedQuantity, t.PaidQuantity) < it.Quantity {
				return checkoutPlan{}, domain.ErrInventory
			}
			rows = append(rows, planRow{ticketID: t.ID, name: t.Name, unit: t.PriceRupiah, qty: it.Quantity, attendees: it.Attendees})
		}
	}
	var items []map[string]any
	var sub int64
	for _, r := range rows {
		line := r.unit * int64(r.qty)
		sub += line
		row := map[string]any{"ticketTypeId": r.ticketID, "name": r.name, "quantity": r.qty, "unitPriceRupiah": r.unit, "lineTotalRupiah": line}
		if r.seatLabel != nil {
			row["seatLabel"] = *r.seatLabel
		}
		if r.section != nil {
			row["sectionName"] = *r.section
		}
		t := byID[r.ticketID]
		row["availability"] = domain.Remaining(t.Quota, t.ReservedQuantity, t.PaidQuantity)
		items = append(items, row)
	}
	if sub > domain.MaxOrderSubtotal {
		return checkoutPlan{}, domain.ErrCheckoutInvalid
	}
	return checkoutPlan{items: items, raw: rows, subtotal: sub}, nil
}

func eligible(e eventdomain.Event, t eventdomain.TicketType, now time.Time) error {
	st := eventdomain.TicketSaleStatus(e, t, now)
	if st == eventdomain.SaleNotStarted || st == eventdomain.SaleEnded || st == eventdomain.SaleStopped {
		return domain.ErrSaleNotActive
	}
	if st != eventdomain.SaleAvailable {
		return domain.ErrNotPurchasable
	}
	return nil
}

func uniqueTicketIDs(p checkoutPlan) []string {
	seen := map[string]struct{}{}
	var ids []string
	for _, r := range p.raw {
		if _, ok := seen[r.ticketID]; ok {
			continue
		}
		seen[r.ticketID] = struct{}{}
		ids = append(ids, r.ticketID)
	}
	return ids
}

func (s *Service) view(ctx context.Context, o domain.Order, now time.Time) (OrderView, error) {
	e, _ := s.Store.GetEvent(ctx, o.EventID)
	items := make([]map[string]any, 0, len(o.Items))
	for _, it := range o.Items {
		row := map[string]any{
			"ticketTypeId": it.TicketTypeID, "name": it.TicketTypeName, "quantity": it.Quantity,
			"unitPriceRupiah": it.UnitPriceRupiah, "lineTotalRupiah": it.LineTotalRupiah,
		}
		if it.SeatLabel != nil {
			row["seatLabel"] = *it.SeatLabel
		}
		if it.SectionName != nil {
			row["sectionName"] = *it.SectionName
		}
		if len(it.Attendees) > 0 {
			holders := make([]map[string]any, 0, len(it.Attendees))
			for _, a := range it.Attendees {
				holders = append(holders, map[string]any{
					"fullName": a.FullName, "email": a.Email, "phone": a.Phone, "identityNumber": a.IdentityNumber,
				})
			}
			row["attendees"] = holders
		}
		items = append(items, row)
	}
	ev := map[string]any{"id": o.EventID, "title": e.Title, "slug": e.Slug, "timezone": e.Timezone}
	return OrderView{
		ID: o.ID, OrderNumber: o.OrderNumber, Status: o.Status, Event: ev, Items: items,
		SubtotalRupiah: o.SubtotalRupiah, RedeemedPoints: o.RedeemedPoints, LoyaltyDiscountRupiah: o.LoyaltyDiscountRupiah,
		TotalPayableRupiah: o.TotalPayableRupiah, Currency: o.Currency,
		ExpiresAt: o.ExpiresAt.UTC().Format(time.RFC3339Nano), ServerTime: now.UTC().Format(time.RFC3339Nano),
	}, nil
}

func (s *Service) requireBuyer(ctx context.Context, actor authdomain.User) error {
	if !actor.IsActive() {
		return authdomain.ErrForbidden
	}
	if actor.Role == authdomain.RoleAdmin {
		return authdomain.ErrForbidden
	}
	if s.BuyerGate != nil {
		return s.BuyerGate(ctx, actor)
	}
	return nil
}

func (s *Service) inTx(ctx context.Context, fn func(context.Context) error) error {
	if s.UoW == nil {
		return fn(ctx)
	}
	return s.UoW(ctx, fn)
}

func (s *Service) retryTx(ctx context.Context, fn func(context.Context) error) error {
	var err error
	for i := 0; i < 3; i++ {
		err = s.inTx(ctx, fn)
		if err == nil || !retryable(err) {
			return err
		}
		time.Sleep(time.Duration(10*(i+1)) * time.Millisecond)
	}
	return err
}

func retryable(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "40001") || strings.Contains(msg, "40P01") || strings.Contains(msg, "could not serialize")
}

func (s *Service) limit(ctx context.Context, scope, userID, ip string, max int, window time.Duration) error {
	if s.Rates == nil || s.HashKey == nil {
		return nil
	}
	n, err := s.Rates.Hit(ctx, s.HashKey(authapp.HashRateKey(scope, ip, userID)), scope, window)
	if err != nil {
		return err
	}
	if n > max {
		return domain.ErrRateLimited
	}
	return nil
}

func (s *Service) record(ctx context.Context, actorID, action, entityID string, before, after map[string]any) error {
	if s.Audit == nil {
		return nil
	}
	return s.Audit.Record(ctx, auditdomain.Record{
		ActorType: auditdomain.ActorUser, ActorUserID: &actorID, Action: action,
		EntityType: "Order", EntityID: &entityID, Outcome: auditdomain.OutcomeSuccess,
		Before: before, After: after, Metadata: map[string]any{"source": "api"},
		CorrelationID: logger.CorrelationFrom(ctx),
	})
}

func (s *Service) recordSystem(ctx context.Context, action, entityID string, before, after map[string]any) error {
	if s.Audit == nil {
		return nil
	}
	return s.Audit.Record(ctx, auditdomain.Record{
		ActorType: auditdomain.ActorSystem, Action: action,
		EntityType: "Order", EntityID: &entityID, Outcome: auditdomain.OutcomeSuccess,
		Before: before, After: after, Metadata: map[string]any{"source": "job"},
		CorrelationID: logger.CorrelationFrom(ctx),
	})
}

func (s *Service) emit(ctx context.Context, name, actorID, entityID string) {
	if s.Analytics == nil {
		return
	}
	_ = s.Analytics.Emit(ctx, analyticsapp.Input{
		Name: name, ActorUserID: actorID, EntityType: "Order", EntityID: entityID,
		Properties:       map[string]any{"source": "api", "entityType": "Order", "entityId": entityID},
		DeduplicationKey: name + ":" + entityID,
	})
}

func sha256Hex(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func orderNumber(id string) string {
	clean := strings.ToUpper(strings.ReplaceAll(id, "-", ""))
	if len(clean) > 12 {
		clean = clean[:12]
	}
	return "ORD-" + clean
}

func encodeCursor(t time.Time, id string) string {
	return hex.EncodeToString([]byte(fmt.Sprintf("%s|%s", t.UTC().Format(time.RFC3339Nano), id)))
}

func decodeCursor(raw string) (time.Time, string, error) {
	b, err := hex.DecodeString(raw)
	if err != nil {
		return time.Time{}, "", err
	}
	parts := strings.SplitN(string(b), "|", 2)
	if len(parts) != 2 {
		return time.Time{}, "", errors.New("cursor")
	}
	tm, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return time.Time{}, "", err
	}
	return tm, parts[1], nil
}
