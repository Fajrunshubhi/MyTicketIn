package application

import (
	"context"
	"sort"
	"sync"
	"time"

	"myticketin/internal/modules/checkin/domain"
	eventdomain "myticketin/internal/modules/events/domain"
	orgdomain "myticketin/internal/modules/organizers/domain"
)

type Memory struct {
	mu       sync.Mutex
	events   map[string]eventdomain.Event
	staff    map[string]eventdomain.StaffAssignment
	profiles map[string]orgdomain.Profile
	tickets  map[string]*domain.TicketView
	byHash   map[string]string
	byManual map[string]string
	attempts map[string]domain.Attempt
	names    map[string]string
}

func NewMemory() *Memory {
	return &Memory{
		events: map[string]eventdomain.Event{}, staff: map[string]eventdomain.StaffAssignment{},
		profiles: map[string]orgdomain.Profile{}, tickets: map[string]*domain.TicketView{},
		byHash: map[string]string{}, byManual: map[string]string{}, attempts: map[string]domain.Attempt{},
		names: map[string]string{},
	}
}

func (m *Memory) PutEvent(e eventdomain.Event) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.events[e.ID] = e
}

func (m *Memory) PutProfile(p orgdomain.Profile) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.profiles[p.ID] = p
}

func (m *Memory) PutStaff(a eventdomain.StaffAssignment) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.staff[a.EventID+"|"+a.UserID] = a
}

func (m *Memory) PutTicket(t domain.TicketView, hash, manual string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := t
	m.tickets[t.ID] = &cp
	if hash != "" {
		m.byHash[hash] = t.ID
	}
	if manual != "" {
		m.byManual[manual] = t.ID
	}
}

func (m *Memory) PutUser(id, name string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.names[id] = name
}

func (m *Memory) GetEvent(_ context.Context, id string) (eventdomain.Event, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.events[id]
	if !ok {
		return eventdomain.Event{}, domain.ErrNotFound
	}
	return e, nil
}

func (m *Memory) GetStaffByUser(_ context.Context, eventID, userID string) (eventdomain.StaffAssignment, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	a, ok := m.staff[eventID+"|"+userID]
	if !ok {
		return eventdomain.StaffAssignment{}, eventdomain.ErrStaffNotFound
	}
	return a, nil
}

func (m *Memory) GetProfile(_ context.Context, id string) (orgdomain.Profile, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.profiles[id]
	if !ok {
		return orgdomain.Profile{}, domain.ErrNotFound
	}
	return p, nil
}

func (m *Memory) LookupQR(_ context.Context, tokenHash string) (*domain.TicketView, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id, ok := m.byHash[tokenHash]
	if !ok {
		return nil, nil
	}
	cp := *m.tickets[id]
	return &cp, nil
}

func (m *Memory) LookupManual(_ context.Context, code string) (*domain.TicketView, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id, ok := m.byManual[code]
	if !ok {
		return nil, nil
	}
	cp := *m.tickets[id]
	return &cp, nil
}

func (m *Memory) MarkUsed(_ context.Context, ticketID, eventID, actorID string, now time.Time) (bool, *time.Time, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.tickets[ticketID]
	if !ok || t.EventID != eventID || t.Status != "UNUSED" {
		return false, nil, nil
	}
	t.Status = "USED"
	t.UsedAt = &now
	t.UsedByUserID = &actorID
	return true, &now, nil
}

func attemptKey(operatorID, eventID, keyHash string) string {
	return operatorID + "|" + eventID + "|" + keyHash
}

func (m *Memory) GetAttemptByKey(_ context.Context, operatorID, eventID, keyHash string) (domain.Attempt, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	a, ok := m.attempts[attemptKey(operatorID, eventID, keyHash)]
	if !ok {
		return domain.Attempt{}, domain.ErrNotFound
	}
	return a, nil
}

func (m *Memory) InsertAttempt(_ context.Context, a domain.Attempt) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	k := attemptKey(a.OperatorUserID, a.EventID, a.IdempotencyHash)
	if _, ok := m.attempts[k]; ok {
		return domain.ErrKeyReused
	}
	if a.Result == domain.ResultValid && a.TicketID != nil {
		for _, existing := range m.attempts {
			if existing.Result == domain.ResultValid && existing.TicketID != nil && *existing.TicketID == *a.TicketID {
				return domain.ErrUnavailable
			}
		}
	}
	m.attempts[k] = a
	return nil
}

func (m *Memory) ListAttempts(_ context.Context, eventID, result string, from, to *time.Time, limit int, cursorAt *time.Time, cursorID string) ([]domain.Attempt, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var rows []domain.Attempt
	for _, a := range m.attempts {
		if a.EventID != eventID {
			continue
		}
		if result != "" && string(a.Result) != result {
			continue
		}
		if from != nil && a.AttemptedAt.Before(*from) {
			continue
		}
		if to != nil && !a.AttemptedAt.Before(*to) {
			continue
		}
		if cursorAt != nil {
			if a.AttemptedAt.After(*cursorAt) || (a.AttemptedAt.Equal(*cursorAt) && a.ID >= cursorID) {
				continue
			}
		}
		rows = append(rows, a)
	}
	sort.Slice(rows, func(i, j int) bool {
		if !rows[i].AttemptedAt.Equal(rows[j].AttemptedAt) {
			return rows[i].AttemptedAt.After(rows[j].AttemptedAt)
		}
		return rows[i].ID > rows[j].ID
	})
	if limit > 0 && len(rows) > limit {
		rows = rows[:limit]
	}
	return rows, nil
}

func (m *Memory) GetUserName(_ context.Context, id string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.names[id], nil
}
