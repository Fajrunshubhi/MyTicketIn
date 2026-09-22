package application

import (
	"context"
	"strings"
	"time"

	analyticsapp "myticketin/internal/modules/analytics/application"
	auditdomain "myticketin/internal/modules/audit/domain"
	authapp "myticketin/internal/modules/auth/application"
	authdomain "myticketin/internal/modules/auth/domain"
	"myticketin/internal/modules/events/domain"
	notifydomain "myticketin/internal/modules/notifications/domain"
	orgdomain "myticketin/internal/modules/organizers/domain"
	platdb "myticketin/internal/platform/db"
)

type Store interface {
	CreateEvent(ctx context.Context, e domain.Event) error
	GetEvent(ctx context.Context, id string) (domain.Event, error)
	GetEventBySlug(ctx context.Context, slug string) (domain.Event, error)
	GetEventForUpdate(ctx context.Context, id string) (domain.Event, error)
	ListCatalog(ctx context.Context, q domain.CatalogQuery, now time.Time, limit int, cursorAt *time.Time, cursorID string) ([]domain.CatalogListRow, error)
	ListCatalogFilters(ctx context.Context, now time.Time) (domain.CatalogFilters, error)
	UpdateEvent(ctx context.Context, e domain.Event, expectedVersion int) error
	DeleteEvent(ctx context.Context, id string, expectedVersion int) error
	ListEvents(ctx context.Context, organizerID, status string, limit int, cursorAt *time.Time, cursorID string) ([]domain.Event, error)
	CreateTicket(ctx context.Context, t domain.TicketType) error
	UpdateTicket(ctx context.Context, t domain.TicketType, expectedVersion int) error
	DeleteTicket(ctx context.Context, eventID, ticketID string, expectedVersion int) error
	ListTickets(ctx context.Context, eventID string) ([]domain.TicketType, error)
	ReplaceSections(ctx context.Context, eventID string, sections []domain.Section) error
	ListSections(ctx context.Context, eventID string) ([]domain.Section, error)
	ReplaceSeats(ctx context.Context, eventID string, seats []domain.Seat) error
	ListSeats(ctx context.Context, eventID string) ([]domain.Seat, error)
	UpsertSeatMap(ctx context.Context, sm domain.SeatMap) error
	GetSeatMap(ctx context.Context, eventID string) (domain.SeatMap, error)
	ListModeration(ctx context.Context, status, q string, limit int, cursorAt *time.Time, cursorID string) ([]domain.QueueItem, error)
	StopTicket(ctx context.Context, t domain.TicketType, expectedVersion int) error
	ListStaff(ctx context.Context, eventID string) ([]domain.StaffAssignment, error)
	GetStaff(ctx context.Context, eventID, assignmentID string) (domain.StaffAssignment, error)
	GetStaffByUser(ctx context.Context, eventID, userID string) (domain.StaffAssignment, error)
	UpsertStaff(ctx context.Context, a domain.StaffAssignment, expectedVersion int) error
	UpdateEventLifecycle(ctx context.Context, e domain.Event, expectedVersion int) error
	CreateLifecycleRequest(ctx context.Context, r domain.LifecycleRequest) error
	GetLifecycleRequest(ctx context.Context, id string) (domain.LifecycleRequest, error)
	GetLifecycleRequestForUpdate(ctx context.Context, id string) (domain.LifecycleRequest, error)
	ListPendingLifecycleRequests(ctx context.Context) ([]domain.LifecycleRequest, error)
	ListEventLifecycleRequests(ctx context.Context, eventID string) ([]domain.LifecycleRequest, error)
	UpdateLifecycleRequest(ctx context.Context, r domain.LifecycleRequest, expectedVersion int) error
}

type ProfileReader interface {
	GetByID(ctx context.Context, id string) (orgdomain.Profile, error)
}

type SeatHoldReader interface {
	ListHeldSeatIDs(ctx context.Context, eventID string) ([]string, error)
}

type PendingCanceller interface {
	CancelPendingForEvent(ctx context.Context, eventID, reason string) error
}

type TicketCanceller interface {
	CancelUnusedForEvent(ctx context.Context, eventID string) error
}

type UserReader interface {
	GetByID(ctx context.Context, id string) (authdomain.User, error)
	SearchActiveStaff(ctx context.Context, q string, limit int) ([]authdomain.User, error)
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

type Capability interface {
	RequireApprovedOrganizer(ctx context.Context, userID string) (string, error)
}

type Service struct {
	Store         Store
	Cap           Capability
	Audit         Auditor
	Analytics     Analytics
	Rates         Limiter
	HashKey       func(raw string) string
	AI            PosterSuggester
	CatalogAI     CatalogParser
	Users         UserReader
	Profiles      ProfileReader
	Holds         SeatHoldReader
	PendingOrders PendingCanceller
	Tickets       TicketCanceller
	Notify        interface {
		Enqueue(ctx context.Context, cmd notifydomain.Command) error
		RecipientsForCancelledEvent(ctx context.Context, eventID string) ([]string, error)
	}
	Policies      *authdomain.Registry
	UoW           func(ctx context.Context, fn func(context.Context) error) error
	Now           func() time.Time
	RelaxedLimits bool
	GalleryDir    string
}

func NewService(store Store, cap Capability) *Service {
	return &Service{Store: store, Cap: cap, AI: DisabledAI{}, Policies: authdomain.NewRegistry(), Now: func() time.Time { return time.Now().UTC() }}
}

func (s *Service) requireOrg(ctx context.Context, actor authdomain.User) (string, error) {
	if !actor.IsActive() {
		return "", domain.ErrAccessDenied
	}
	if s.Cap == nil {
		return "", domain.ErrAccessDenied
	}
	id, err := s.Cap.RequireApprovedOrganizer(ctx, actor.ID)
	if err != nil {
		if err == orgdomain.ErrNotApproved || err == orgdomain.ErrRequired {
			return "", domain.ErrAccessDenied
		}
		return "", err
	}
	return id, nil
}

func (s *Service) owned(ctx context.Context, actor authdomain.User, eventID string) (domain.Event, string, error) {
	orgID, err := s.requireOrg(ctx, actor)
	if err != nil {
		return domain.Event{}, "", err
	}
	e, err := s.Store.GetEvent(ctx, eventID)
	if err != nil {
		return domain.Event{}, "", domain.ErrNotFound
	}
	if e.OrganizerProfileID != orgID {
		return domain.Event{}, "", domain.ErrNotFound
	}
	return e, orgID, nil
}

func (s *Service) Create(ctx context.Context, actor authdomain.User, in EventInput, ip string) (domain.Event, error) {
	orgID, err := s.requireOrg(ctx, actor)
	if err != nil {
		return domain.Event{}, err
	}
	in, err = NormalizeEvent(in)
	if err != nil {
		return domain.Event{}, err
	}
	if err := s.limit(ctx, "event", actor.ID, ip, 20, time.Hour); err != nil {
		return domain.Event{}, err
	}
	id, err := platdb.NewID()
	if err != nil {
		return domain.Event{}, err
	}
	now := s.Now()
	var phone *string
	if in.ContactPhone != "" {
		phone = &in.ContactPhone
	}
	e := domain.Event{
		ID: id, OrganizerProfileID: orgID, Title: in.Title, Description: in.Description,
		Category: in.Category, VenueName: in.VenueName, AddressLine: in.AddressLine,
		City: in.City, Province: in.Province, Latitude: in.Latitude, Longitude: in.Longitude, Tags: in.Tags, GalleryURLs: in.GalleryURLs, Timezone: in.Timezone,
		StartsAt: in.StartsAt, EndsAt: in.EndsAt, Terms: in.Terms,
		ContactEmail: in.ContactEmail, ContactPhone: phone, Status: domain.StatusDraft,
		InventoryMode: in.InventoryMode, CreatedAt: now, UpdatedAt: now, Version: 1,
	}
	for i := 0; i < 4; i++ {
		suffix := id
		if len(suffix) > 8 {
			suffix = suffix[:8]
		}
		if i > 0 {
			extra, _ := platdb.NewID()
			if len(extra) > 4 {
				suffix = extra[:4]
			}
		}
		e.Slug = Slugify(in.Title, suffix)
		err = s.inTx(ctx, func(ctx context.Context) error {
			if err := s.Store.CreateEvent(ctx, e); err != nil {
				return err
			}
			return s.record(ctx, actor.ID, "event.create", e.ID, nil, snapshot(e))
		})
		if err == domain.ErrSlugConflict {
			continue
		}
		if err != nil {
			return domain.Event{}, err
		}
		s.emit(ctx, "event_created", actor.ID, e.ID)
		return e, nil
	}
	return domain.Event{}, domain.ErrSlugConflict
}

func (s *Service) List(ctx context.Context, actor authdomain.User, status string, limit int, cursorAt *time.Time, cursorID string) ([]domain.Event, error) {
	orgID, err := s.requireOrg(ctx, actor)
	if err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 25
	}
	return s.Store.ListEvents(ctx, orgID, status, limit, cursorAt, cursorID)
}

func (s *Service) Get(ctx context.Context, actor authdomain.User, id string) (domain.Event, []domain.TicketType, []domain.Section, []domain.Seat, *domain.SeatMap, error) {
	e, _, err := s.owned(ctx, actor, id)
	if err != nil {
		return domain.Event{}, nil, nil, nil, nil, err
	}
	types, _ := s.Store.ListTickets(ctx, id)
	secs, _ := s.Store.ListSections(ctx, id)
	seats, _ := s.Store.ListSeats(ctx, id)
	sm, err := s.Store.GetSeatMap(ctx, id)
	var smPtr *domain.SeatMap
	if err == nil {
		smPtr = &sm
	}
	return e, types, secs, seats, smPtr, nil
}

func (s *Service) Update(ctx context.Context, actor authdomain.User, id string, in EventInput, expectedVersion int) (domain.Event, error) {
	in, err := NormalizeEvent(in)
	if err != nil {
		return domain.Event{}, err
	}
	var out domain.Event
	err = s.inTx(ctx, func(ctx context.Context) error {
		e, _, err := s.owned(ctx, actor, id)
		if err != nil {
			return err
		}
		if !domain.DetailsEditable(e.Status) {
			return domain.ErrStatusInvalid
		}
		before := e
		e.Title, e.Description, e.Category = in.Title, in.Description, in.Category
		e.VenueName, e.AddressLine, e.City, e.Province = in.VenueName, in.AddressLine, in.City, in.Province
		e.Latitude, e.Longitude, e.Tags, e.GalleryURLs = in.Latitude, in.Longitude, in.Tags, in.GalleryURLs
		e.Timezone, e.StartsAt, e.EndsAt, e.Terms = in.Timezone, in.StartsAt, in.EndsAt, in.Terms
		e.ContactEmail = in.ContactEmail
		if e.Status == domain.StatusDraft {
			e.InventoryMode = in.InventoryMode
		} else if in.InventoryMode != e.InventoryMode {
			return domain.ErrModeMismatch
		}
		if in.ContactPhone == "" {
			e.ContactPhone = nil
		} else {
			e.ContactPhone = &in.ContactPhone
		}
		e.UpdatedAt = s.Now()
		if err := s.Store.UpdateEvent(ctx, e, expectedVersion); err != nil {
			return err
		}
		e.Version = expectedVersion + 1
		out = e
		return s.record(ctx, actor.ID, "event.update", e.ID, snapshot(before), snapshot(e))
	})
	return out, err
}

func (s *Service) Delete(ctx context.Context, actor authdomain.User, id string, expectedVersion int) error {
	return s.inTx(ctx, func(ctx context.Context) error {
		e, _, err := s.owned(ctx, actor, id)
		if err != nil {
			return err
		}
		if !domain.Deletable(e.Status) {
			return domain.ErrStatusInvalid
		}
		types, _ := s.Store.ListTickets(ctx, id)
		for _, t := range types {
			if err := s.Store.DeleteTicket(ctx, id, t.ID, t.Version); err != nil {
				return err
			}
		}
		_ = s.Store.ReplaceSeats(ctx, id, nil)
		_ = s.Store.ReplaceSections(ctx, id, nil)
		if err := s.Store.DeleteEvent(ctx, id, expectedVersion); err != nil {
			return err
		}
		return s.record(ctx, actor.ID, "event.delete", id, snapshot(e), nil)
	})
}

func (s *Service) Submit(ctx context.Context, actor authdomain.User, id string, expectedVersion int) (domain.Event, error) {
	var out domain.Event
	err := s.inTx(ctx, func(ctx context.Context) error {
		e, err := s.Store.GetEventForUpdate(ctx, id)
		if err != nil {
			return domain.ErrNotFound
		}
		orgID, err := s.requireOrg(ctx, actor)
		if err != nil {
			return err
		}
		if e.OrganizerProfileID != orgID {
			return domain.ErrNotFound
		}
		if e.Status != domain.StatusDraft {
			return domain.ErrStatusInvalid
		}
		if e.Version != expectedVersion {
			return domain.ErrVersionConflict
		}
		types, err := s.Store.ListTickets(ctx, id)
		if err != nil {
			return err
		}
		if err := s.validateSubmit(ctx, e, types); err != nil {
			return err
		}
		before := e
		now := s.Now()
		e.Status = domain.StatusPendingReview
		e.SubmittedAt = &now
		e.UpdatedAt = now
		if err := s.Store.UpdateEvent(ctx, e, expectedVersion); err != nil {
			return err
		}
		e.Version = expectedVersion + 1
		out = e
		return s.record(ctx, actor.ID, "event.submit", e.ID, snapshot(before), snapshot(e))
	})
	if err != nil {
		return domain.Event{}, err
	}
	s.emit(ctx, "event_submitted", actor.ID, out.ID)
	return out, nil
}

func (s *Service) validateSubmit(ctx context.Context, e domain.Event, types []domain.TicketType) error {
	now := s.Now()
	if !now.Before(e.StartsAt) || !now.Before(e.EndsAt) {
		return domain.ErrTimeInvalid
	}
	if len(types) == 0 {
		return domain.ErrTicketRequired
	}
	for _, t := range types {
		if !t.SaleEndsAt.After(t.SaleStartsAt) || t.SaleEndsAt.After(e.StartsAt) {
			return domain.ErrTicketInvalid
		}
	}
	secs, _ := s.Store.ListSections(ctx, e.ID)
	seats, _ := s.Store.ListSeats(ctx, e.ID)
	switch e.InventoryMode {
	case domain.ModeGA:
		return nil
	case domain.ModeZoned:
		if len(secs) == 0 {
			return domain.ErrIncomplete
		}
	case domain.ModeReserved:
		if len(secs) == 0 || len(seats) == 0 {
			return domain.ErrIncomplete
		}
		sm, err := s.Store.GetSeatMap(ctx, e.ID)
		if err != nil || sm.Status != domain.ImageReady || strings.TrimSpace(sm.AltText) == "" || strings.TrimSpace(sm.Legend) == "" {
			return domain.ErrIncomplete
		}
		counts := map[string]int{}
		secType := map[string]string{}
		for _, sec := range secs {
			secType[sec.ID] = sec.TicketTypeID
		}
		for _, seat := range seats {
			tid := secType[seat.SectionID]
			counts[tid]++
		}
		for _, t := range types {
			if counts[t.ID] != t.Quota {
				return domain.ErrIncomplete
			}
		}
	}
	return nil
}

func (s *Service) AddTicket(ctx context.Context, actor authdomain.User, eventID string, in TicketInput) (domain.TicketType, error) {
	in, err := NormalizeTicket(in)
	if err != nil {
		return domain.TicketType{}, err
	}
	var out domain.TicketType
	err = s.inTx(ctx, func(ctx context.Context) error {
		e, _, err := s.owned(ctx, actor, eventID)
		if err != nil {
			return err
		}
		if !domain.AuthoringMutable(e.Status) {
			return domain.ErrStatusInvalid
		}
		if !in.SaleEndsAt.After(in.SaleStartsAt) || in.SaleEndsAt.After(e.StartsAt) {
			return domain.ErrTicketInvalid
		}
		id, err := platdb.NewID()
		if err != nil {
			return err
		}
		now := s.Now()
		var desc *string
		if in.Description != "" {
			desc = &in.Description
		}
		t := domain.TicketType{
			ID: id, EventID: eventID, Name: in.Name, Description: desc,
			PriceRupiah: in.PriceRupiah, Quota: in.Quota, MaxPerAccount: in.MaxPerAccount,
			SaleStartsAt: in.SaleStartsAt, SaleEndsAt: in.SaleEndsAt, SortOrder: in.SortOrder,
			CreatedAt: now, UpdatedAt: now, Version: 1,
		}
		if err := s.Store.CreateTicket(ctx, t); err != nil {
			return err
		}
		e.UpdatedAt = now
		_ = s.Store.UpdateEvent(ctx, e, e.Version)
		out = t
		return s.record(ctx, actor.ID, "event.ticket.create", eventID, nil, map[string]any{"ticketId": t.ID, "name": t.Name})
	})
	return out, err
}

func (s *Service) UpdateTicket(ctx context.Context, actor authdomain.User, eventID, ticketID string, in TicketInput, expectedVersion int) (domain.TicketType, error) {
	in, err := NormalizeTicket(in)
	if err != nil {
		return domain.TicketType{}, err
	}
	var out domain.TicketType
	err = s.inTx(ctx, func(ctx context.Context) error {
		e, _, err := s.owned(ctx, actor, eventID)
		if err != nil {
			return err
		}
		if !domain.DetailsEditable(e.Status) {
			return domain.ErrStatusInvalid
		}
		if in.SaleEndsAt.After(e.StartsAt) {
			return domain.ErrTicketInvalid
		}
		list, err := s.Store.ListTickets(ctx, eventID)
		if err != nil {
			return err
		}
		var cur domain.TicketType
		found := false
		for _, t := range list {
			if t.ID == ticketID {
				cur = t
				found = true
				break
			}
		}
		if !found {
			return domain.ErrNotFound
		}
		if in.Quota < cur.PaidQuantity {
			return domain.ErrQuotaBelowSold
		}
		if in.Quota < cur.ReservedQuantity+cur.PaidQuantity {
			return domain.ErrQuotaBelowSold
		}
		var desc *string
		if in.Description != "" {
			desc = &in.Description
		}
		cur.Name, cur.Description = in.Name, desc
		cur.PriceRupiah, cur.Quota, cur.MaxPerAccount = in.PriceRupiah, in.Quota, in.MaxPerAccount
		cur.SaleStartsAt, cur.SaleEndsAt, cur.SortOrder = in.SaleStartsAt, in.SaleEndsAt, in.SortOrder
		cur.UpdatedAt = s.Now()
		if err := s.Store.UpdateTicket(ctx, cur, expectedVersion); err != nil {
			return err
		}
		cur.Version = expectedVersion + 1
		out = cur
		return s.record(ctx, actor.ID, "event.ticket.update", eventID, nil, map[string]any{"ticketId": ticketID})
	})
	return out, err
}

func (s *Service) DeleteTicket(ctx context.Context, actor authdomain.User, eventID, ticketID string, expectedVersion int) error {
	return s.inTx(ctx, func(ctx context.Context) error {
		e, _, err := s.owned(ctx, actor, eventID)
		if err != nil {
			return err
		}
		if !domain.AuthoringMutable(e.Status) {
			return domain.ErrStatusInvalid
		}
		if err := s.Store.DeleteTicket(ctx, eventID, ticketID, expectedVersion); err != nil {
			return err
		}
		return s.record(ctx, actor.ID, "event.ticket.delete", eventID, nil, map[string]any{"ticketId": ticketID})
	})
}

func (s *Service) PutSections(ctx context.Context, actor authdomain.User, eventID string, items []domain.Section, expectedVersion int) error {
	return s.inTx(ctx, func(ctx context.Context) error {
		e, _, err := s.owned(ctx, actor, eventID)
		if err != nil {
			return err
		}
		if !domain.AuthoringMutable(e.Status) {
			return domain.ErrStatusInvalid
		}
		if e.InventoryMode == domain.ModeGA {
			return domain.ErrModeMismatch
		}
		if e.Version != expectedVersion {
			return domain.ErrVersionConflict
		}
		types, _ := s.Store.ListTickets(ctx, eventID)
		valid := map[string]struct{}{}
		for _, t := range types {
			valid[t.ID] = struct{}{}
		}
		seen := map[string]struct{}{}
		for i := range items {
			if _, ok := valid[items[i].TicketTypeID]; !ok {
				return domain.ErrTicketInvalid
			}
			key := strings.ToLower(strings.TrimSpace(items[i].Name))
			if key == "" {
				return domain.ErrIncomplete
			}
			if _, ok := seen[key]; ok {
				return domain.ErrIncomplete
			}
			seen[key] = struct{}{}
			if items[i].ID == "" {
				id, err := platdb.NewID()
				if err != nil {
					return err
				}
				items[i].ID = id
			}
			items[i].EventID = eventID
		}
		if err := s.Store.ReplaceSections(ctx, eventID, items); err != nil {
			return err
		}
		e.UpdatedAt = s.Now()
		return s.Store.UpdateEvent(ctx, e, expectedVersion)
	})
}

func (s *Service) PutSeats(ctx context.Context, actor authdomain.User, eventID string, items []domain.Seat, expectedVersion int) error {
	return s.inTx(ctx, func(ctx context.Context) error {
		e, _, err := s.owned(ctx, actor, eventID)
		if err != nil {
			return err
		}
		if !domain.AuthoringMutable(e.Status) {
			return domain.ErrStatusInvalid
		}
		if e.InventoryMode != domain.ModeReserved {
			return domain.ErrModeMismatch
		}
		if e.Version != expectedVersion {
			return domain.ErrVersionConflict
		}
		secs, _ := s.Store.ListSections(ctx, eventID)
		valid := map[string]struct{}{}
		for _, sec := range secs {
			valid[sec.ID] = struct{}{}
		}
		labels := map[string]struct{}{}
		for i := range items {
			if _, ok := valid[items[i].SectionID]; !ok {
				return domain.ErrIncomplete
			}
			lab := strings.TrimSpace(items[i].Label)
			if lab == "" || len(lab) > 32 {
				return domain.ErrIncomplete
			}
			if _, ok := labels[lab]; ok {
				return domain.ErrIncomplete
			}
			labels[lab] = struct{}{}
			if items[i].ID == "" {
				id, err := platdb.NewID()
				if err != nil {
					return err
				}
				items[i].ID = id
			}
			items[i].EventID = eventID
			items[i].Label = lab
		}
		if err := s.Store.ReplaceSeats(ctx, eventID, items); err != nil {
			return err
		}
		e.UpdatedAt = s.Now()
		return s.Store.UpdateEvent(ctx, e, expectedVersion)
	})
}

func (s *Service) PutSeatMapMeta(ctx context.Context, actor authdomain.User, eventID, alt, legend string, expectedVersion int) error {
	alt, legend = strings.TrimSpace(alt), strings.TrimSpace(legend)
	if len([]rune(alt)) < 3 || len([]rune(legend)) < 3 {
		return domain.ErrIncomplete
	}
	return s.inTx(ctx, func(ctx context.Context) error {
		e, _, err := s.owned(ctx, actor, eventID)
		if err != nil {
			return err
		}
		if !domain.AuthoringMutable(e.Status) {
			return domain.ErrStatusInvalid
		}
		if e.InventoryMode != domain.ModeReserved && e.InventoryMode != domain.ModeZoned {
			return domain.ErrModeMismatch
		}
		id, err := platdb.NewID()
		if err != nil {
			return err
		}
		sm := domain.SeatMap{
			ID: id, EventID: eventID, StorageKey: "placeholder/" + eventID,
			MimeType: "image/png", ByteSize: 1, AltText: alt, Legend: legend, Status: domain.ImageReady,
		}
		if err := s.Store.UpsertSeatMap(ctx, sm); err != nil {
			return err
		}
		e.UpdatedAt = s.Now()
		return s.Store.UpdateEvent(ctx, e, expectedVersion)
	})
}

func snapshot(e domain.Event) map[string]any {
	return map[string]any{"id": e.ID, "status": string(e.Status), "version": e.Version, "mode": string(e.InventoryMode)}
}

func (s *Service) inTx(ctx context.Context, fn func(context.Context) error) error {
	if platdb.TxFrom(ctx) != nil {
		return fn(ctx)
	}
	if s.UoW == nil {
		return fn(ctx)
	}
	return s.UoW(ctx, fn)
}

func (s *Service) record(ctx context.Context, actorID, action, entityID string, before, after map[string]any) error {
	if s.Audit == nil {
		return nil
	}
	return s.Audit.Record(ctx, auditdomain.Record{
		ActorType: auditdomain.ActorUser, ActorUserID: &actorID, Action: action,
		EntityType: "Event", EntityID: &entityID, Outcome: auditdomain.OutcomeSuccess,
		Before: before, After: after, Metadata: map[string]any{"source": "api"},
	})
}

func (s *Service) emit(ctx context.Context, name, actorID, entityID string) {
	if s.Analytics == nil {
		return
	}
	_ = s.Analytics.Emit(ctx, analyticsapp.Input{
		Name: name, ActorUserID: actorID, EntityType: "Event", EntityID: entityID,
		Properties: map[string]any{"source": "api", "entityType": "Event", "entityId": entityID},
	})
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
