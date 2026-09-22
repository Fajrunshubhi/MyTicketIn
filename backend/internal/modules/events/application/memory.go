package application

import (
	"context"
	"strings"
	"sync"
	"time"

	"myticketin/internal/modules/events/domain"
)

type Memory struct {
	mu       sync.Mutex
	events   map[string]domain.Event
	tickets  map[string][]domain.TicketType
	sections map[string][]domain.Section
	seats    map[string][]domain.Seat
	maps     map[string]domain.SeatMap
	slugs    map[string]string
	staff    map[string][]domain.StaffAssignment
	requests map[string]domain.LifecycleRequest
}

func NewMemory() *Memory {
	return &Memory{
		events:   map[string]domain.Event{},
		tickets:  map[string][]domain.TicketType{},
		sections: map[string][]domain.Section{},
		seats:    map[string][]domain.Seat{},
		maps:     map[string]domain.SeatMap{},
		slugs:    map[string]string{},
		staff:    map[string][]domain.StaffAssignment{},
		requests: map[string]domain.LifecycleRequest{},
	}
}

func (m *Memory) CreateEvent(_ context.Context, e domain.Event) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.slugs[e.Slug]; ok {
		return domain.ErrSlugConflict
	}
	m.events[e.ID] = e
	m.slugs[e.Slug] = e.ID
	return nil
}

func (m *Memory) GetEvent(_ context.Context, id string) (domain.Event, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.events[id]
	if !ok {
		return domain.Event{}, domain.ErrNotFound
	}
	return e, nil
}

func (m *Memory) GetEventForUpdate(ctx context.Context, id string) (domain.Event, error) {
	return m.GetEvent(ctx, id)
}

func (m *Memory) UpdateEvent(_ context.Context, e domain.Event, expectedVersion int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cur, ok := m.events[e.ID]
	if !ok {
		return domain.ErrNotFound
	}
	if cur.Version != expectedVersion {
		return domain.ErrVersionConflict
	}
	if cur.Slug != e.Slug {
		delete(m.slugs, cur.Slug)
		if _, ok := m.slugs[e.Slug]; ok {
			return domain.ErrSlugConflict
		}
		m.slugs[e.Slug] = e.ID
	}
	e.Version = expectedVersion + 1
	m.events[e.ID] = e
	return nil
}

func (m *Memory) DeleteEvent(_ context.Context, id string, expectedVersion int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cur, ok := m.events[id]
	if !ok {
		return domain.ErrNotFound
	}
	if cur.Version != expectedVersion {
		return domain.ErrVersionConflict
	}
	delete(m.slugs, cur.Slug)
	delete(m.events, id)
	delete(m.tickets, id)
	delete(m.sections, id)
	delete(m.seats, id)
	delete(m.maps, id)
	return nil
}

func (m *Memory) ListEvents(_ context.Context, organizerID, status string, limit int, cursorAt *time.Time, cursorID string) ([]domain.Event, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []domain.Event
	for _, e := range m.events {
		if e.OrganizerProfileID != organizerID {
			continue
		}
		if status != "" && string(e.Status) != status {
			continue
		}
		out = append(out, e)
		if len(out) >= limit {
			break
		}
	}
	return out, nil
}

func (m *Memory) CreateTicket(_ context.Context, t domain.TicketType) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, existing := range m.tickets[t.EventID] {
		if strings.EqualFold(existing.Name, t.Name) {
			return domain.ErrTicketNameExists
		}
	}
	m.tickets[t.EventID] = append(m.tickets[t.EventID], t)
	return nil
}

func (m *Memory) UpdateTicket(_ context.Context, t domain.TicketType, expectedVersion int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	list := m.tickets[t.EventID]
	for i, existing := range list {
		if existing.ID != t.ID {
			if strings.EqualFold(existing.Name, t.Name) {
				return domain.ErrTicketNameExists
			}
			continue
		}
		if existing.Version != expectedVersion {
			return domain.ErrVersionConflict
		}
		t.Version = expectedVersion + 1
		list[i] = t
		m.tickets[t.EventID] = list
		return nil
	}
	return domain.ErrNotFound
}

func (m *Memory) DeleteTicket(_ context.Context, eventID, ticketID string, expectedVersion int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	list := m.tickets[eventID]
	for i, existing := range list {
		if existing.ID != ticketID {
			continue
		}
		if existing.Version != expectedVersion {
			return domain.ErrVersionConflict
		}
		m.tickets[eventID] = append(list[:i], list[i+1:]...)
		return nil
	}
	return domain.ErrNotFound
}

func (m *Memory) ListTickets(_ context.Context, eventID string) ([]domain.TicketType, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := append([]domain.TicketType{}, m.tickets[eventID]...)
	return out, nil
}

func (m *Memory) ReplaceSections(_ context.Context, eventID string, sections []domain.Section) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sections[eventID] = sections
	delete(m.seats, eventID)
	return nil
}

func (m *Memory) ListSections(_ context.Context, eventID string) ([]domain.Section, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]domain.Section{}, m.sections[eventID]...), nil
}

func (m *Memory) ReplaceSeats(_ context.Context, eventID string, seats []domain.Seat) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.seats[eventID] = seats
	return nil
}

func (m *Memory) ListSeats(_ context.Context, eventID string) ([]domain.Seat, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]domain.Seat{}, m.seats[eventID]...), nil
}

func (m *Memory) UpsertSeatMap(_ context.Context, sm domain.SeatMap) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.maps[sm.EventID] = sm
	return nil
}

func (m *Memory) GetSeatMap(_ context.Context, eventID string) (domain.SeatMap, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sm, ok := m.maps[eventID]
	if !ok {
		return domain.SeatMap{}, domain.ErrNotFound
	}
	return sm, nil
}

func (m *Memory) ListModeration(_ context.Context, status, q string, limit int, _ *time.Time, _ string) ([]domain.QueueItem, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	q = strings.ToLower(q)
	var out []domain.QueueItem
	for _, e := range m.events {
		if status != "" && string(e.Status) != status {
			continue
		}
		if q != "" && !strings.Contains(strings.ToLower(e.Title), q) {
			continue
		}
		out = append(out, domain.QueueItem{Event: e})
		if len(out) >= limit {
			break
		}
	}
	return out, nil
}

func (m *Memory) StopTicket(_ context.Context, t domain.TicketType, expectedVersion int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	list := m.tickets[t.EventID]
	for i, existing := range list {
		if existing.ID != t.ID {
			continue
		}
		if existing.Version != expectedVersion {
			return domain.ErrVersionConflict
		}
		t.Version = expectedVersion + 1
		list[i] = t
		m.tickets[t.EventID] = list
		return nil
	}
	return domain.ErrNotFound
}

func (m *Memory) ListStaff(_ context.Context, eventID string) ([]domain.StaffAssignment, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]domain.StaffAssignment{}, m.staff[eventID]...), nil
}

func (m *Memory) GetStaff(_ context.Context, eventID, assignmentID string) (domain.StaffAssignment, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, a := range m.staff[eventID] {
		if a.ID == assignmentID {
			return a, nil
		}
	}
	return domain.StaffAssignment{}, domain.ErrStaffNotFound
}

func (m *Memory) GetStaffByUser(_ context.Context, eventID, userID string) (domain.StaffAssignment, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, a := range m.staff[eventID] {
		if a.UserID == userID {
			return a, nil
		}
	}
	return domain.StaffAssignment{}, domain.ErrStaffNotFound
}

func (m *Memory) UpsertStaff(_ context.Context, a domain.StaffAssignment, expectedVersion int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	list := m.staff[a.EventID]
	for i, existing := range list {
		if existing.ID == a.ID || existing.UserID == a.UserID {
			if expectedVersion != 0 && existing.Version != expectedVersion {
				return domain.ErrVersionConflict
			}
			if expectedVersion != 0 {
				a.Version = expectedVersion + 1
			}
			list[i] = a
			m.staff[a.EventID] = list
			return nil
		}
	}
	m.staff[a.EventID] = append(list, a)
	return nil
}

func (m *Memory) GetEventBySlug(_ context.Context, slug string) (domain.Event, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id, ok := m.slugs[slug]
	if !ok {
		return domain.Event{}, domain.ErrNotFound
	}
	e, ok := m.events[id]
	if !ok {
		return domain.Event{}, domain.ErrNotFound
	}
	return e, nil
}

func (m *Memory) ListCatalog(_ context.Context, q domain.CatalogQuery, now time.Time, limit int, cursorAt *time.Time, cursorID string) ([]domain.CatalogListRow, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var from, toExcl time.Time
	if q.DateFrom != "" {
		var err error
		from, toExcl, err = domain.JakartaDayBounds(q.DateFrom, q.DateTo)
		if err != nil {
			return nil, err
		}
	}
	var rows []domain.CatalogListRow
	for _, e := range m.events {
		if !domain.EventListEligible(e, now) {
			continue
		}
		if q.Category != "" && strings.ToLower(e.Category) != q.Category {
			continue
		}
		if q.City != "" && strings.ToLower(e.City) != q.City {
			continue
		}
		if q.Province != "" && strings.ToLower(e.Province) != q.Province {
			continue
		}
		if q.Tag != "" {
			ok := false
			for _, tag := range e.Tags {
				if tag == q.Tag {
					ok = true
					break
				}
			}
			if !ok {
				continue
			}
		}
		if q.DateFrom != "" && !(e.StartsAt.Before(toExcl) && !e.EndsAt.Before(from)) {
			continue
		}
		if q.Q != "" && !catalogTextMatch(e, q.Q) {
			continue
		}
		if cursorAt != nil {
			if q.Sort == domain.SortNewest {
				pub := e.CreatedAt
				if e.PublishedAt != nil {
					pub = *e.PublishedAt
				}
				if pub.After(*cursorAt) || (pub.Equal(*cursorAt) && e.ID >= cursorID) {
					continue
				}
			} else if e.StartsAt.Before(*cursorAt) || (e.StartsAt.Equal(*cursorAt) && e.ID <= cursorID) {
				continue
			}
		}
		rows = append(rows, domain.CatalogListRow{Event: e})
	}
	sortCatalogRows(rows, q.Sort)
	if len(rows) > limit {
		rows = rows[:limit]
	}
	return rows, nil
}

func catalogTextMatch(e domain.Event, q string) bool {
	hay := strings.ToLower(e.Title + " " + e.Category + " " + e.VenueName + " " + e.City + " " + e.Province + " " + strings.Join(e.Tags, " "))
	for _, tok := range strings.Fields(strings.ToLower(q)) {
		if !strings.Contains(hay, tok) {
			return false
		}
	}
	return true
}

func sortCatalogRows(rows []domain.CatalogListRow, sort domain.CatalogSort) {
	for i := 0; i < len(rows); i++ {
		for j := i + 1; j < len(rows); j++ {
			swap := false
			if sort == domain.SortNewest {
				ai, bi := rows[i].Event.CreatedAt, rows[j].Event.CreatedAt
				if rows[i].Event.PublishedAt != nil {
					ai = *rows[i].Event.PublishedAt
				}
				if rows[j].Event.PublishedAt != nil {
					bi = *rows[j].Event.PublishedAt
				}
				if ai.Before(bi) || (ai.Equal(bi) && rows[i].Event.ID < rows[j].Event.ID) {
					swap = true
				}
			} else if rows[i].Event.StartsAt.After(rows[j].Event.StartsAt) || (rows[i].Event.StartsAt.Equal(rows[j].Event.StartsAt) && rows[i].Event.ID > rows[j].Event.ID) {
				swap = true
			}
			if swap {
				rows[i], rows[j] = rows[j], rows[i]
			}
		}
	}
}

func (m *Memory) ListCatalogFilters(_ context.Context, now time.Time) (domain.CatalogFilters, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	catSet := map[string]struct{}{}
	locSet := map[string]domain.CatalogLocation{}
	tagSet := map[string]struct{}{}
	for _, e := range m.events {
		if !domain.EventListEligible(e, now) {
			continue
		}
		catSet[e.Category] = struct{}{}
		locSet[strings.ToLower(e.City)+"|"+strings.ToLower(e.Province)] = domain.CatalogLocation{City: e.City, Province: e.Province}
		for _, tag := range e.Tags {
			tagSet[tag] = struct{}{}
		}
	}
	out := domain.CatalogFilters{}
	for c := range catSet {
		out.Categories = append(out.Categories, c)
	}
	for _, loc := range locSet {
		out.Locations = append(out.Locations, loc)
	}
	for tag := range tagSet {
		out.Tags = append(out.Tags, tag)
	}
	return out, nil
}

func (m *Memory) UpdateEventLifecycle(ctx context.Context, e domain.Event, expectedVersion int) error {
	return m.UpdateEvent(ctx, e, expectedVersion)
}

func (m *Memory) CreateLifecycleRequest(_ context.Context, r domain.LifecycleRequest) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, cur := range m.requests {
		if cur.Status == domain.LifecyclePending && cur.EventID == r.EventID && cur.Kind == r.Kind {
			if r.Kind == domain.KindCancelEvent || (cur.TicketTypeID != nil && r.TicketTypeID != nil && *cur.TicketTypeID == *r.TicketTypeID) {
				return domain.ErrLifecyclePending
			}
		}
	}
	m.requests[r.ID] = r
	return nil
}

func (m *Memory) GetLifecycleRequest(_ context.Context, id string) (domain.LifecycleRequest, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.requests[id]
	if !ok {
		return domain.LifecycleRequest{}, domain.ErrLifecycleNotFound
	}
	return m.enrichRequest(r), nil
}

func (m *Memory) GetLifecycleRequestForUpdate(ctx context.Context, id string) (domain.LifecycleRequest, error) {
	return m.GetLifecycleRequest(ctx, id)
}

func (m *Memory) ListPendingLifecycleRequests(_ context.Context) ([]domain.LifecycleRequest, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []domain.LifecycleRequest
	for _, r := range m.requests {
		if r.Status == domain.LifecyclePending {
			out = append(out, m.enrichRequest(r))
		}
	}
	return out, nil
}

func (m *Memory) ListEventLifecycleRequests(_ context.Context, eventID string) ([]domain.LifecycleRequest, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []domain.LifecycleRequest
	for _, r := range m.requests {
		if r.EventID == eventID {
			out = append(out, m.enrichRequest(r))
		}
	}
	return out, nil
}

func (m *Memory) UpdateLifecycleRequest(_ context.Context, r domain.LifecycleRequest, expectedVersion int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cur, ok := m.requests[r.ID]
	if !ok {
		return domain.ErrLifecycleNotFound
	}
	if cur.Version != expectedVersion {
		return domain.ErrVersionConflict
	}
	r.Version = expectedVersion + 1
	m.requests[r.ID] = r
	return nil
}

func (m *Memory) enrichRequest(r domain.LifecycleRequest) domain.LifecycleRequest {
	if e, ok := m.events[r.EventID]; ok {
		r.EventTitle = e.Title
	}
	return r
}
