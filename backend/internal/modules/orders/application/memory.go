package application

import (
	"context"
	"sort"
	"sync"
	"time"

	eventdomain "myticketin/internal/modules/events/domain"
	loyaltydomain "myticketin/internal/modules/loyalty/domain"
	"myticketin/internal/modules/orders/domain"
	orgdomain "myticketin/internal/modules/organizers/domain"
	"myticketin/internal/platform/db"
)

type Memory struct {
	mu           sync.Mutex
	events       map[string]eventdomain.Event
	tickets      map[string]eventdomain.TicketType
	byEvent      map[string][]string
	sections     map[string][]eventdomain.Section
	seats        map[string]eventdomain.Seat
	seatsByEvent map[string][]string
	orders       map[string]domain.Order
	byBuyer      []string
	res          map[string]domain.Reservation
	idem         map[string]domain.Idempotency    // actor|keyhash
	accounts     map[string]loyaltydomain.Account // buyer|org
	accountsByID map[string]loyaltydomain.Account
	loyRes       map[string]loyRes // orderID
	ledger       map[string]struct{}
	orgs         map[string]orgdomain.Profile
	now          func() time.Time
}

type loyRes struct {
	ID, AccountID, OrderID, Status string
	Points, Discount               int64
	ReleaseReason                  *string
}

func NewMemory() *Memory {
	return &Memory{
		events: map[string]eventdomain.Event{}, tickets: map[string]eventdomain.TicketType{},
		byEvent: map[string][]string{}, sections: map[string][]eventdomain.Section{},
		seats: map[string]eventdomain.Seat{}, seatsByEvent: map[string][]string{},
		orders: map[string]domain.Order{}, res: map[string]domain.Reservation{},
		idem: map[string]domain.Idempotency{}, accounts: map[string]loyaltydomain.Account{},
		accountsByID: map[string]loyaltydomain.Account{}, loyRes: map[string]loyRes{},
		ledger: map[string]struct{}{}, orgs: map[string]orgdomain.Profile{},
		now: func() time.Time { return time.Now().UTC() },
	}
}

func idemKey(actor, hash string) string { return actor + "|" + domain.ScopeCreateOrder + "|" + hash }

func (m *Memory) PutEvent(e eventdomain.Event, tickets []eventdomain.TicketType, sections []eventdomain.Section, seats []eventdomain.Seat) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.events[e.ID] = e
	var ids []string
	for _, t := range tickets {
		m.tickets[t.ID] = t
		ids = append(ids, t.ID)
	}
	sort.Strings(ids)
	m.byEvent[e.ID] = ids
	m.sections[e.ID] = sections
	var sids []string
	for _, s := range seats {
		m.seats[s.ID] = s
		sids = append(sids, s.ID)
	}
	m.seatsByEvent[e.ID] = sids
}

func (m *Memory) PutOrganizer(p orgdomain.Profile) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.orgs[p.ID] = p
}

func (m *Memory) PutLoyalty(buyer, org string, balance, reserved, debt int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id := buyer + "-" + org
	acc := loyaltydomain.Account{ID: id, BuyerUserID: buyer, OrganizerProfileID: org, BalancePoints: balance, ReservedPoints: reserved, DebtPoints: debt, Version: 1}
	m.accounts[buyer+"|"+org] = acc
	m.accountsByID[id] = acc
}

func (m *Memory) GetEvent(_ context.Context, id string) (eventdomain.Event, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.events[id]
	if !ok {
		return eventdomain.Event{}, eventdomain.ErrNotFound
	}
	return e, nil
}

func (m *Memory) GetEventForUpdate(ctx context.Context, id string) (eventdomain.Event, error) {
	return m.GetEvent(ctx, id)
}

func (m *Memory) ListTickets(_ context.Context, eventID string) ([]eventdomain.TicketType, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []eventdomain.TicketType
	for _, id := range m.byEvent[eventID] {
		out = append(out, m.tickets[id])
	}
	return out, nil
}

func (m *Memory) ListSections(_ context.Context, eventID string) ([]eventdomain.Section, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]eventdomain.Section{}, m.sections[eventID]...), nil
}

func (m *Memory) ListSeats(_ context.Context, eventID string) ([]eventdomain.Seat, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []eventdomain.Seat
	for _, id := range m.seatsByEvent[eventID] {
		out = append(out, m.seats[id])
	}
	return out, nil
}

func (m *Memory) LockTickets(_ context.Context, ids []string) ([]eventdomain.TicketType, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sort.Strings(ids)
	var out []eventdomain.TicketType
	for _, id := range ids {
		t, ok := m.tickets[id]
		if !ok {
			return nil, domain.ErrCheckoutInvalid
		}
		out = append(out, t)
	}
	return out, nil
}

func (m *Memory) IncrementReserved(_ context.Context, ticketID string, n int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.tickets[ticketID]
	if !ok {
		return domain.ErrInventory
	}
	if t.ReservedQuantity+t.PaidQuantity+n > t.Quota {
		return domain.ErrInventory
	}
	t.ReservedQuantity += n
	m.tickets[ticketID] = t
	return nil
}

func (m *Memory) DecrementReserved(_ context.Context, ticketID string, n int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	t := m.tickets[ticketID]
	if t.ReservedQuantity < n {
		return domain.ErrConflict
	}
	t.ReservedQuantity -= n
	m.tickets[ticketID] = t
	return nil
}

func (m *Memory) SeatHeld(_ context.Context, seatID string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, r := range m.res {
		if r.EventSeatID != nil && *r.EventSeatID == seatID && r.ReleasedAt == nil {
			return true, nil
		}
	}
	return false, nil
}

func (m *Memory) GetSeat(_ context.Context, id string) (eventdomain.Seat, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.seats[id]
	if !ok {
		return eventdomain.Seat{}, domain.ErrSeatUnavailable
	}
	return s, nil
}

func (m *Memory) ListHeldSeatIDs(_ context.Context, eventID string) ([]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []string
	for _, r := range m.res {
		if r.ReleasedAt != nil || r.EventSeatID == nil {
			continue
		}
		ord, ok := m.orders[r.OrderID]
		if !ok || ord.EventID != eventID {
			continue
		}
		out = append(out, *r.EventSeatID)
	}
	return out, nil
}

func (m *Memory) AccountUnits(_ context.Context, buyerID, eventID, ticketTypeID string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, o := range m.orders {
		if o.BuyerUserID != buyerID || o.EventID != eventID {
			continue
		}
		if o.Status == domain.StatusPaid {
			for _, it := range o.Items {
				if it.TicketTypeID == ticketTypeID {
					n += it.Quantity
				}
			}
		}
	}
	for _, r := range m.res {
		if r.ReleasedAt != nil || r.TicketTypeID != ticketTypeID {
			continue
		}
		o := m.orders[r.OrderID]
		if o.BuyerUserID == buyerID && o.EventID == eventID && o.Status == domain.StatusPending {
			n += r.Quantity
		}
	}
	return n, nil
}

func (m *Memory) InsertOrder(_ context.Context, o *domain.Order) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.orders[o.ID] = *o
	m.byBuyer = append(m.byBuyer, o.ID)
	return nil
}

func (m *Memory) UpdateOrder(_ context.Context, o domain.Order, expected int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cur, ok := m.orders[o.ID]
	if !ok || cur.Version != expected {
		return domain.ErrConflict
	}
	o.Version = expected + 1
	o.Items = cur.Items
	m.orders[o.ID] = o
	return nil
}

func (m *Memory) GetOrder(_ context.Context, id string) (domain.Order, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	o, ok := m.orders[id]
	if !ok {
		return domain.Order{}, domain.ErrNotFound
	}
	return o, nil
}

func (m *Memory) GetOrderForUpdate(ctx context.Context, id string) (domain.Order, error) {
	return m.GetOrder(ctx, id)
}

func (m *Memory) ListBuyerOrders(_ context.Context, buyerID string, limit int, cursorAt *time.Time, cursorID string) ([]domain.Order, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var all []domain.Order
	for _, o := range m.orders {
		if o.BuyerUserID == buyerID {
			all = append(all, o)
		}
	}
	sort.Slice(all, func(i, j int) bool {
		if all[i].CreatedAt.Equal(all[j].CreatedAt) {
			return all[i].ID > all[j].ID
		}
		return all[i].CreatedAt.After(all[j].CreatedAt)
	})
	var out []domain.Order
	for _, o := range all {
		if cursorAt != nil {
			if o.CreatedAt.After(*cursorAt) || (o.CreatedAt.Equal(*cursorAt) && o.ID >= cursorID) {
				continue
			}
		}
		out = append(out, o)
		if len(out) == limit {
			break
		}
	}
	return out, nil
}

func (m *Memory) InsertItem(_ context.Context, it domain.Item) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	o := m.orders[it.OrderID]
	o.Items = append(o.Items, it)
	m.orders[it.OrderID] = o
	return nil
}

func (m *Memory) InsertAttendees(_ context.Context, eventID string, it domain.Item) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	o := m.orders[it.OrderID]
	for i := range o.Items {
		if o.Items[i].ID == it.ID {
			o.Items[i].Attendees = it.Attendees
		}
	}
	m.orders[it.OrderID] = o
	_ = eventID
	return nil
}

func (m *Memory) IdentityTaken(_ context.Context, eventID, identityNumber, excludeOrderID string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, o := range m.orders {
		if o.EventID != eventID || o.ID == excludeOrderID {
			continue
		}
		if o.Status != domain.StatusPending && o.Status != domain.StatusPaid {
			continue
		}
		for _, it := range o.Items {
			for _, a := range it.Attendees {
				if a.IdentityNumber == identityNumber {
					return true, nil
				}
			}
		}
	}
	return false, nil
}

func (m *Memory) InsertReservation(_ context.Context, r domain.Reservation) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if r.EventSeatID != nil {
		for _, existing := range m.res {
			if existing.ReleasedAt == nil && existing.EventSeatID != nil && *existing.EventSeatID == *r.EventSeatID {
				return domain.ErrSeatUnavailable
			}
		}
	}
	m.res[r.ID] = r
	return nil
}

func (m *Memory) ListActiveReservations(_ context.Context, orderID string) ([]domain.Reservation, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []domain.Reservation
	for _, r := range m.res {
		if r.OrderID == orderID && r.ReleasedAt == nil {
			out = append(out, r)
		}
	}
	return out, nil
}

func (m *Memory) ReleaseReservation(_ context.Context, id string, at time.Time, reason string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.res[id]
	if !ok || r.ReleasedAt != nil {
		return nil
	}
	r.ReleasedAt = &at
	r.ReleaseReason = &reason
	m.res[id] = r
	return nil
}

func (m *Memory) ClaimIdempotency(_ context.Context, rec domain.Idempotency) (domain.Idempotency, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	k := idemKey(rec.ActorUserID, rec.KeyHash)
	if existing, ok := m.idem[k]; ok {
		return existing, false, nil
	}
	m.idem[k] = rec
	return rec, true, nil
}

func (m *Memory) CompleteIdempotency(_ context.Context, actor, keyHash string, httpStatus int, resourceID string, body []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	k := idemKey(actor, keyHash)
	rec := m.idem[k]
	st := domain.IdempotencyDone
	rt := "Order"
	rec.Status = st
	rec.HTTPStatus = &httpStatus
	rec.ResourceType = &rt
	rec.ResourceID = &resourceID
	rec.ResponseBody = body
	m.idem[k] = rec
	return nil
}

func (m *Memory) GetLoyaltyForUpdate(_ context.Context, buyerID, orgID string) (loyaltydomain.Account, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	acc, ok := m.accounts[buyerID+"|"+orgID]
	if !ok {
		return loyaltydomain.Account{}, loyaltydomain.ErrAccountNotFound
	}
	return acc, nil
}

func (m *Memory) UpsertLoyaltyForUpdate(_ context.Context, buyerID, orgID string) (loyaltydomain.Account, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	k := buyerID + "|" + orgID
	if acc, ok := m.accounts[k]; ok {
		return acc, nil
	}
	id, err := db.NewID()
	if err != nil {
		return loyaltydomain.Account{}, err
	}
	acc := loyaltydomain.Account{ID: id, BuyerUserID: buyerID, OrganizerProfileID: orgID, Version: 1}
	m.accounts[k] = acc
	m.accountsByID[id] = acc
	return acc, nil
}

func (m *Memory) GetLoyalty(_ context.Context, buyerID, orgID string) (loyaltydomain.Account, error) {
	return m.GetLoyaltyForUpdate(context.Background(), buyerID, orgID)
}

func (m *Memory) ReservePoints(_ context.Context, acc loyaltydomain.Account, orderID string, points, discount int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cur := m.accountsByID[acc.ID]
	avail := loyaltydomain.AvailablePoints(cur.BalancePoints, cur.ReservedPoints, cur.DebtPoints)
	if points > avail {
		return loyaltydomain.ErrInsufficient
	}
	cur.ReservedPoints += points
	cur.Version++
	m.accountsByID[acc.ID] = cur
	m.accounts[cur.BuyerUserID+"|"+cur.OrganizerProfileID] = cur
	id, err := db.NewID()
	if err != nil {
		return err
	}
	m.loyRes[orderID] = loyRes{ID: id, AccountID: acc.ID, OrderID: orderID, Status: loyaltydomain.ReservationActive, Points: points, Discount: discount}
	return nil
}

func (m *Memory) ReleasePoints(_ context.Context, orderID, reason string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.loyRes[orderID]
	if !ok || r.Status != loyaltydomain.ReservationActive {
		return false, nil
	}
	acc := m.accountsByID[r.AccountID]
	if acc.ReservedPoints < r.Points {
		return false, domain.ErrConflict
	}
	acc.ReservedPoints -= r.Points
	acc.Version++
	m.accountsByID[acc.ID] = acc
	m.accounts[acc.BuyerUserID+"|"+acc.OrganizerProfileID] = acc
	r.Status = loyaltydomain.ReservationReleased
	r.ReleaseReason = &reason
	m.loyRes[orderID] = r
	return true, nil
}

func (m *Memory) GetByID(_ context.Context, id string) (orgdomain.Profile, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.orgs[id]
	if !ok {
		return orgdomain.Profile{}, orgdomain.ErrNotFound
	}
	return p, nil
}

func (m *Memory) ListDuePending(_ context.Context, now time.Time, limit int) ([]domain.Order, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []domain.Order
	for _, o := range m.orders {
		if o.Status == domain.StatusPending && !o.ExpiresAt.After(now) {
			out = append(out, o)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].ExpiresAt.Equal(out[j].ExpiresAt) {
			return out[i].ID < out[j].ID
		}
		return out[i].ExpiresAt.Before(out[j].ExpiresAt)
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (m *Memory) ListPendingByEvent(_ context.Context, eventID string) ([]domain.Order, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []domain.Order
	for _, o := range m.orders {
		if o.EventID == eventID && o.Status == domain.StatusPending {
			out = append(out, o)
		}
	}
	return out, nil
}

func (m *Memory) IncrementPaid(_ context.Context, ticketID string, n int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.tickets[ticketID]
	if !ok || t.ReservedQuantity < n {
		return domain.ErrInventory
	}
	t.ReservedQuantity -= n
	t.PaidQuantity += n
	m.tickets[ticketID] = t
	return nil
}

func (m *Memory) ConsumeLoyaltyReservation(_ context.Context, orderID string) (int64, string, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.loyRes[orderID]
	if !ok || r.Status != loyaltydomain.ReservationActive {
		return 0, "", false, nil
	}
	r.Status = loyaltydomain.ReservationConsumed
	m.loyRes[orderID] = r
	return r.Points, r.AccountID, true, nil
}

func (m *Memory) AdjustLoyaltyAccount(_ context.Context, acc loyaltydomain.Account) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	acc.Version++
	m.accountsByID[acc.ID] = acc
	m.accounts[acc.BuyerUserID+"|"+acc.OrganizerProfileID] = acc
	return nil
}

func (m *Memory) InsertLedger(_ context.Context, accountID, entryType string, delta int64, sourceKey, orderID string, refundID *string, balanceAfter, debtAfter int64, corr string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	k := accountID + "|" + sourceKey + "|" + entryType
	if _, ok := m.ledger[k]; ok {
		return loyaltydomain.ErrConflict
	}
	m.ledger[k] = struct{}{}
	_, _, _, _, _, _ = delta, orderID, refundID, balanceAfter, debtAfter, corr
	return nil
}

func (m *Memory) MarkOrderPaid(_ context.Context, o domain.Order, earned int64, now time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cur, ok := m.orders[o.ID]
	if !ok || cur.Status != domain.StatusPending {
		return domain.ErrConflict
	}
	cur.Status = domain.StatusPaid
	cur.LoyaltyEarnedPoints = earned
	cur.UpdatedAt = now
	cur.Version++
	m.orders[o.ID] = cur
	return nil
}

func (m *Memory) MarkOrderRefunded(_ context.Context, o domain.Order, now time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cur := m.orders[o.ID]
	cur.Status = o.Status
	cur.LoyaltyRedeemedRestored = o.LoyaltyRedeemedRestored
	cur.LoyaltyReversedPoints = o.LoyaltyReversedPoints
	cur.UpdatedAt = now
	cur.Version++
	m.orders[o.ID] = cur
	return nil
}

func (m *Memory) OrderSnapshot(id string) domain.Order {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.orders[id]
}

func (m *Memory) Ticket(id string) eventdomain.TicketType {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.tickets[id]
}

func (m *Memory) Loyalty(buyer, org string) loyaltydomain.Account {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.accounts[buyer+"|"+org]
}
