package application

import (
	"context"
	"strings"
	"sync"
	"time"

	"myticketin/internal/modules/notifications/domain"
	platdb "myticketin/internal/platform/db"
)

type Memory struct {
	mu       sync.Mutex
	Outbox   map[string]domain.OutboxRow
	Notes    map[string]domain.Notification
	Cands    []domain.ReminderCandidate
	Eligible map[string]bool
	Cancel   map[string][]string
}

func NewMemory() *Memory {
	return &Memory{
		Outbox: map[string]domain.OutboxRow{}, Notes: map[string]domain.Notification{},
		Eligible: map[string]bool{}, Cancel: map[string][]string{},
	}
}

func (m *Memory) InsertOutbox(_ context.Context, row domain.OutboxRow) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := row.DomainEventID + "|" + row.RecipientID + "|" + string(row.Type)
	for _, o := range m.Outbox {
		if o.DomainEventID+"|"+o.RecipientID+"|"+string(o.Type) == key {
			return errUnique
		}
	}
	m.Outbox[row.ID] = row
	return nil
}

func (m *Memory) ClaimDue(_ context.Context, limit int, worker string, now time.Time) ([]domain.OutboxRow, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []domain.OutboxRow
	for id, row := range m.Outbox {
		if row.Status != domain.OutboxPending && row.Status != domain.OutboxFailed {
			continue
		}
		if row.NextAttemptAt.After(now) {
			continue
		}
		row.Status = domain.OutboxProcessing
		m.Outbox[id] = row
		out = append(out, row)
		if len(out) >= limit {
			break
		}
	}
	_ = worker
	return out, nil
}

func (m *Memory) CompleteOutbox(_ context.Context, id string, now time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	row := m.Outbox[id]
	row.Status = domain.OutboxCompleted
	m.Outbox[id] = row
	_ = now
	return nil
}

func (m *Memory) FailOutbox(_ context.Context, id string, attempts int, next time.Time, code string, terminal bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	row := m.Outbox[id]
	row.AttemptCount = attempts
	row.NextAttemptAt = next
	if terminal {
		row.Status = domain.OutboxFailed
	} else {
		row.Status = domain.OutboxPending
	}
	m.Outbox[id] = row
	_ = code
	return nil
}

func (m *Memory) ReclaimStale(context.Context, time.Time) error { return nil }

func (m *Memory) UpsertInApp(_ context.Context, n domain.Notification) (domain.Notification, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, existing := range m.Notes {
		if existing.RecipientID == n.RecipientID && existing.DedupKey == n.DedupKey {
			return existing, nil
		}
	}
	if n.ID == "" {
		id, _ := platdb.NewID()
		n.ID = id
	}
	m.Notes[n.ID] = n
	return n, nil
}

func (m *Memory) UpsertDelivery(context.Context, string, domain.Channel, domain.DeliveryStatus, string, string, string, string, int, *time.Time) error {
	return nil
}

func (m *Memory) List(_ context.Context, userID, filter string, limit int, _ *time.Time, _ string) ([]domain.Notification, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []domain.Notification
	for _, n := range m.Notes {
		if n.RecipientID != userID {
			continue
		}
		if filter == "unread" && n.ReadAt != nil {
			continue
		}
		out = append(out, n)
		if len(out) >= limit {
			break
		}
	}
	return out, nil
}

func (m *Memory) UnreadCount(_ context.Context, userID string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, x := range m.Notes {
		if x.RecipientID == userID && x.ReadAt == nil {
			n++
		}
	}
	return n, nil
}

func (m *Memory) Get(_ context.Context, id string) (domain.Notification, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, ok := m.Notes[id]
	if !ok {
		return domain.Notification{}, domain.ErrNotFound
	}
	return n, nil
}

func (m *Memory) MarkRead(_ context.Context, id, userID string, now time.Time) (time.Time, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, ok := m.Notes[id]
	if !ok || n.RecipientID != userID {
		return time.Time{}, domain.ErrNotFound
	}
	if n.ReadAt == nil {
		n.ReadAt = &now
		m.Notes[id] = n
	}
	return *n.ReadAt, nil
}

func (m *Memory) MarkReadAll(_ context.Context, userID string, before time.Time) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for id, x := range m.Notes {
		if x.RecipientID == userID && x.ReadAt == nil && !x.CreatedAt.After(before) {
			t := before
			x.ReadAt = &t
			m.Notes[id] = x
			n++
		}
	}
	return n, nil
}

func (m *Memory) ListReminderCandidates(_ context.Context, _ time.Time, _, _ string, limit int) ([]domain.ReminderCandidate, error) {
	if len(m.Cands) > limit {
		return m.Cands[:limit], nil
	}
	return m.Cands, nil
}

func (m *Memory) ReminderEligible(_ context.Context, eventID, userID string, _ time.Time) (bool, error) {
	return m.Eligible[eventID+"|"+userID], nil
}

func (m *Memory) CancelledRecipients(_ context.Context, eventID string) ([]string, error) {
	return m.Cancel[eventID], nil
}

func (m *Memory) CountOutbox() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.Outbox)
}

type SandboxMailer struct {
	Fail bool
	Sent int
}

func (s *SandboxMailer) ProviderName() string { return "sandbox" }

func (s *SandboxMailer) Send(_ context.Context, in domain.EmailMessage) (string, error) {
	_ = in
	if s.Fail {
		return "", domain.ErrEmailUnavailable
	}
	s.Sent++
	return "sandbox-" + strings.ReplaceAll(in.Idempotency, "|", "-"), nil
}
