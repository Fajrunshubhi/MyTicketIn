package application

import (
	"context"
	"strings"
	"sync"
	"time"

	"myticketin/internal/modules/organizers/domain"
)

type Memory struct {
	mu       sync.Mutex
	byID     map[string]domain.Profile
	byOwner  map[string]string
	versions map[string]int
}

func NewMemory() *Memory {
	return &Memory{
		byID:     map[string]domain.Profile{},
		byOwner:  map[string]string{},
		versions: map[string]int{},
	}
}

func (m *Memory) Create(_ context.Context, p domain.Profile) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.byOwner[p.OwnerUserID]; ok {
		return domain.ErrExists
	}
	m.byID[p.ID] = p
	m.byOwner[p.OwnerUserID] = p.ID
	m.versions[p.ID] = p.Version
	return nil
}

func (m *Memory) GetByID(_ context.Context, id string) (domain.Profile, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.byID[id]
	if !ok {
		return domain.Profile{}, domain.ErrNotFound
	}
	return p, nil
}

func (m *Memory) GetByOwner(_ context.Context, ownerID string) (domain.Profile, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id, ok := m.byOwner[ownerID]
	if !ok {
		return domain.Profile{}, domain.ErrNotFound
	}
	return m.byID[id], nil
}

func (m *Memory) Update(_ context.Context, p domain.Profile, expectedVersion int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cur, ok := m.byID[p.ID]
	if !ok {
		return domain.ErrNotFound
	}
	if cur.Version != expectedVersion {
		return domain.ErrVersionConflict
	}
	p.Version = expectedVersion + 1
	m.byID[p.ID] = p
	m.versions[p.ID] = p.Version
	return nil
}

func (m *Memory) List(_ context.Context, status, q string, limit int, cursorAt *time.Time, cursorID string) ([]domain.Profile, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []domain.Profile
	q = strings.ToLower(q)
	for _, p := range m.byID {
		if status != "" && string(p.Status) != status {
			continue
		}
		if q != "" && !strings.Contains(strings.ToLower(p.Name), q) {
			continue
		}
		if cursorAt != nil {
			if p.SubmittedAt.After(*cursorAt) {
				continue
			}
			if p.SubmittedAt.Equal(*cursorAt) && p.ID >= cursorID {
				continue
			}
		}
		out = append(out, p)
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}
