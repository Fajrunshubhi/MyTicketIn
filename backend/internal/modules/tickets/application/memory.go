package application

import (
	"context"
	"sort"
	"sync"
	"time"

	eventdomain "myticketin/internal/modules/events/domain"
	orderdomain "myticketin/internal/modules/orders/domain"
	ticketdomain "myticketin/internal/modules/tickets/domain"
)

type Memory struct {
	mu      sync.Mutex
	tickets map[string]ticketdomain.Ticket
	runs    map[string]ticketdomain.IssuanceRun
	events  map[string]eventdomain.Event
	orders  map[string]orderdomain.Order
	names   map[string]string
}

func NewMemory() *Memory {
	return &Memory{
		tickets: map[string]ticketdomain.Ticket{},
		runs:    map[string]ticketdomain.IssuanceRun{},
		events:  map[string]eventdomain.Event{},
		orders:  map[string]orderdomain.Order{},
		names:   map[string]string{},
	}
}

func (m *Memory) PutEvent(e eventdomain.Event) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.events[e.ID] = e
}

func (m *Memory) PutOrder(o orderdomain.Order) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.orders[o.ID] = o
}

func (m *Memory) PutUser(id, name string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.names[id] = name
}

func (m *Memory) ClaimIssuance(_ context.Context, run ticketdomain.IssuanceRun) (ticketdomain.IssuanceRun, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if existing, ok := m.runs[run.OrderID]; ok {
		return existing, false, nil
	}
	m.runs[run.OrderID] = run
	return run, true, nil
}

func (m *Memory) CompleteIssuance(_ context.Context, run ticketdomain.IssuanceRun) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.runs[run.OrderID] = run
	return nil
}

func (m *Memory) GetIssuance(_ context.Context, orderID string) (ticketdomain.IssuanceRun, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.runs[orderID]
	if !ok {
		return ticketdomain.IssuanceRun{}, ticketdomain.ErrNotFound
	}
	return r, nil
}

func (m *Memory) HasUnit(_ context.Context, orderItemID string, seq int) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, t := range m.tickets {
		if t.OrderItemID == orderItemID && t.UnitSequence == seq {
			return true, nil
		}
	}
	return false, nil
}

func (m *Memory) InsertTicket(_ context.Context, t ticketdomain.Ticket) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, existing := range m.tickets {
		if existing.OrderItemID == t.OrderItemID && existing.UnitSequence == t.UnitSequence {
			return ticketdomain.ErrTokenCollision
		}
		if existing.TokenHash == t.TokenHash || existing.TicketNumber == t.TicketNumber || existing.ManualCode == t.ManualCode {
			return ticketdomain.ErrTokenCollision
		}
	}
	m.tickets[t.ID] = t
	return nil
}

func (m *Memory) CountOrder(_ context.Context, orderID string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, t := range m.tickets {
		if t.OrderID == orderID {
			n++
		}
	}
	return n, nil
}

func (m *Memory) CountUsed(_ context.Context, orderID string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, t := range m.tickets {
		if t.OrderID == orderID && t.Status == ticketdomain.StatusUsed {
			n++
		}
	}
	return n, nil
}

func (m *Memory) ListOwner(_ context.Context, ownerID, status string, limit int, cursorAt *time.Time, cursorID string) ([]ticketdomain.Ticket, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var rows []ticketdomain.Ticket
	for _, t := range m.tickets {
		if t.OwnerUserID != ownerID {
			continue
		}
		if status != "" && string(t.Status) != status {
			continue
		}
		if cursorAt != nil {
			if t.IssuedAt.After(*cursorAt) || (t.IssuedAt.Equal(*cursorAt) && t.ID >= cursorID) {
				continue
			}
		}
		rows = append(rows, t)
	}
	sort.Slice(rows, func(i, j int) bool {
		if !rows[i].IssuedAt.Equal(rows[j].IssuedAt) {
			return rows[i].IssuedAt.After(rows[j].IssuedAt)
		}
		return rows[i].ID > rows[j].ID
	})
	if limit > 0 && len(rows) > limit {
		rows = rows[:limit]
	}
	return rows, nil
}

func (m *Memory) Get(_ context.Context, id string) (ticketdomain.Ticket, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.tickets[id]
	if !ok {
		return ticketdomain.Ticket{}, ticketdomain.ErrNotFound
	}
	return t, nil
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

func (m *Memory) GetOrder(_ context.Context, id string) (orderdomain.Order, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	o, ok := m.orders[id]
	if !ok {
		return orderdomain.Order{}, orderdomain.ErrNotFound
	}
	return o, nil
}

func (m *Memory) GetUserName(_ context.Context, id string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.names[id], nil
}

func (m *Memory) CancelUnused(_ context.Context, orderID, eventID, source, ref string, now time.Time) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	src := ticketdomain.CancelSource(source)
	for id, t := range m.tickets {
		if t.Status != ticketdomain.StatusUnused {
			continue
		}
		if orderID != "" && t.OrderID != orderID {
			continue
		}
		if eventID != "" && t.EventID != eventID {
			continue
		}
		t.Status = ticketdomain.StatusCancelled
		t.CancelledAt = &now
		t.CancellationSource = &src
		t.CancellationReferenceID = &ref
		t.UpdatedAt = now
		m.tickets[id] = t
		n++
	}
	return n, nil
}

func (m *Memory) ListPaidIncomplete(_ context.Context, limit int) ([]orderdomain.Order, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []orderdomain.Order
	for _, o := range m.orders {
		if o.Status != orderdomain.StatusPaid {
			continue
		}
		exp := 0
		for _, it := range o.Items {
			exp += it.Quantity
		}
		n := 0
		for _, t := range m.tickets {
			if t.OrderID == o.ID {
				n++
			}
		}
		run, ok := m.runs[o.ID]
		if n == exp && ok && run.Status == ticketdomain.IssuanceCompleted {
			continue
		}
		out = append(out, o)
		if len(out) >= limit {
			break
		}
	}
	return out, nil
}

func (m *Memory) MarkUsed(id string, at time.Time) {
	m.mu.Lock()
	defer m.mu.Unlock()
	t := m.tickets[id]
	t.Status = ticketdomain.StatusUsed
	t.UsedAt = &at
	m.tickets[id] = t
}
