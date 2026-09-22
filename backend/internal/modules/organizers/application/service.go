package application

import (
	"context"
	"time"

	analyticsapp "myticketin/internal/modules/analytics/application"
	auditdomain "myticketin/internal/modules/audit/domain"
	authdomain "myticketin/internal/modules/auth/domain"
	notifydomain "myticketin/internal/modules/notifications/domain"
	"myticketin/internal/modules/organizers/domain"
	platdb "myticketin/internal/platform/db"
)

type Store interface {
	Create(ctx context.Context, p domain.Profile) error
	GetByID(ctx context.Context, id string) (domain.Profile, error)
	GetByOwner(ctx context.Context, ownerID string) (domain.Profile, error)
	Update(ctx context.Context, p domain.Profile, expectedVersion int) error
	List(ctx context.Context, status, q string, limit int, cursorAt *time.Time, cursorID string) ([]domain.Profile, error)
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

type Notifier interface {
	Enqueue(ctx context.Context, cmd notifydomain.Command) error
}

type Service struct {
	Store     Store
	Audit     Auditor
	Analytics Analytics
	Rates     Limiter
	Policies  *authdomain.Registry
	UoW       func(ctx context.Context, fn func(context.Context) error) error
	Now       func() time.Time
	HashKey   func(raw string) string
	Notify    Notifier
}

func NewService(store Store) *Service {
	return &Service{
		Store:    store,
		Policies: authdomain.NewRegistry(),
		Now:      func() time.Time { return time.Now().UTC() },
	}
}

func (s *Service) Submit(ctx context.Context, actor authdomain.User, name, email, phone, description, ip string) (domain.Profile, error) {
	if err := s.Policies.Authorize(authdomain.Actor{User: actor}, authdomain.ActionOrganizerApply, authdomain.Resource{}); err != nil {
		return domain.Profile{}, domain.ErrAccessDenied
	}
	name, email, phonePtr, description, err := NormalizeInput(name, email, phone, description)
	if err != nil {
		return domain.Profile{}, err
	}
	if err := s.limit(ctx, actor.ID, ip); err != nil {
		return domain.Profile{}, err
	}
	if _, err := s.Store.GetByOwner(ctx, actor.ID); err == nil {
		return domain.Profile{}, domain.ErrExists
	}
	id, err := platdb.NewID()
	if err != nil {
		return domain.Profile{}, err
	}
	now := s.Now()
	p := domain.Profile{
		ID:           id,
		OwnerUserID:  actor.ID,
		Name:         name,
		ContactEmail: email,
		ContactPhone: phonePtr,
		Description:  description,
		Status:       domain.StatusPending,
		SubmittedAt:  now,
		CreatedAt:    now,
		UpdatedAt:    now,
		Version:      1,
	}
	err = s.inTx(ctx, func(ctx context.Context) error {
		if err := s.Store.Create(ctx, p); err != nil {
			return err
		}
		return s.record(ctx, actor.ID, "organizer.application.submit", p, nil, snapshot(p))
	})
	if err != nil {
		return domain.Profile{}, err
	}
	s.emit(ctx, "organizer_application_submitted", actor.ID, p.ID)
	return p, nil
}

func (s *Service) GetOwn(ctx context.Context, actor authdomain.User) (domain.Profile, error) {
	p, err := s.Store.GetByOwner(ctx, actor.ID)
	if err != nil {
		return domain.Profile{}, err
	}
	if err := s.Policies.Authorize(authdomain.Actor{User: actor}, authdomain.ActionOrganizerOwn, authdomain.Resource{ID: p.ID, OwnerID: p.OwnerUserID}); err != nil {
		return domain.Profile{}, domain.ErrAccessDenied
	}
	return p, nil
}

func (s *Service) Edit(ctx context.Context, actor authdomain.User, name, email, phone, description string, expectedVersion int) (domain.Profile, error) {
	p, err := s.GetOwn(ctx, actor)
	if err != nil {
		return domain.Profile{}, err
	}
	if !domain.CanOwnerEdit(p.Status) {
		if p.Status == domain.StatusPending {
			return domain.Profile{}, domain.ErrPending
		}
		if p.Status == domain.StatusApproved {
			return domain.Profile{}, domain.ErrAlreadyApproved
		}
		return domain.Profile{}, domain.ErrTransitionInvalid
	}
	name, email, phonePtr, description, err := NormalizeInput(name, email, phone, description)
	if err != nil {
		return domain.Profile{}, err
	}
	before := p
	p.Name = name
	p.ContactEmail = email
	p.ContactPhone = phonePtr
	p.Description = description
	p.UpdatedAt = s.Now()
	err = s.inTx(ctx, func(ctx context.Context) error {
		if err := s.Store.Update(ctx, p, expectedVersion); err != nil {
			return err
		}
		p.Version = expectedVersion + 1
		return s.record(ctx, actor.ID, "organizer.application.update", p, snapshot(before), snapshot(p))
	})
	if err != nil {
		return domain.Profile{}, err
	}
	return p, nil
}

func (s *Service) Resubmit(ctx context.Context, actor authdomain.User, expectedVersion int) (domain.Profile, error) {
	p, err := s.GetOwn(ctx, actor)
	if err != nil {
		return domain.Profile{}, err
	}
	if !domain.CanOwnerResubmit(p.Status) {
		if p.Status == domain.StatusPending {
			return domain.Profile{}, domain.ErrPending
		}
		return domain.Profile{}, domain.ErrTransitionInvalid
	}
	if err := s.limit(ctx, actor.ID, actor.ID); err != nil {
		return domain.Profile{}, err
	}
	before := p
	now := s.Now()
	p.Status = domain.StatusPending
	p.DecisionReason = nil
	p.DecidedAt = nil
	p.DecidedByUserID = nil
	p.SubmittedAt = now
	p.UpdatedAt = now
	err = s.inTx(ctx, func(ctx context.Context) error {
		if err := s.Store.Update(ctx, p, expectedVersion); err != nil {
			return err
		}
		p.Version = expectedVersion + 1
		return s.record(ctx, actor.ID, "organizer.application.resubmit", p, snapshot(before), snapshot(p))
	})
	if err != nil {
		return domain.Profile{}, err
	}
	s.emit(ctx, "organizer_application_submitted", actor.ID, p.ID)
	return p, nil
}

func (s *Service) Capabilities(ctx context.Context, actor authdomain.User) (id string, status domain.Status, can bool, err error) {
	if !actor.IsActive() {
		return "", "", false, domain.ErrAccessDenied
	}
	p, err := s.Store.GetByOwner(ctx, actor.ID)
	if err != nil {
		return "", "", false, nil
	}
	return p.ID, p.Status, domain.HasOrganizerCapability(p.Status), nil
}

func (s *Service) RequireApprovedOrganizer(ctx context.Context, userID string) (string, error) {
	p, err := s.Store.GetByOwner(ctx, userID)
	if err != nil {
		return "", domain.ErrRequired
	}
	if !domain.HasOrganizerCapability(p.Status) {
		return "", domain.ErrNotApproved
	}
	return p.ID, nil
}

func (s *Service) GetAdmin(ctx context.Context, actor authdomain.User, id string) (domain.Profile, error) {
	if err := s.Policies.Authorize(authdomain.Actor{User: actor}, authdomain.ActionAdminOrganizer, authdomain.Resource{}); err != nil {
		return domain.Profile{}, domain.ErrAccessDenied
	}
	return s.Store.GetByID(ctx, id)
}

func (s *Service) ListAdmin(ctx context.Context, actor authdomain.User, status, q string, limit int, cursorAt *time.Time, cursorID string) ([]domain.Profile, error) {
	if err := s.Policies.Authorize(authdomain.Actor{User: actor}, authdomain.ActionAdminOrganizer, authdomain.Resource{}); err != nil {
		return nil, domain.ErrAccessDenied
	}
	if q != "" && len([]rune(q)) < 2 {
		q = ""
	}
	return s.Store.List(ctx, status, q, limit, cursorAt, cursorID)
}

func (s *Service) Decide(ctx context.Context, actor authdomain.User, id string, decision domain.Decision, reason string, expectedVersion int) (domain.Profile, error) {
	if err := s.Policies.Authorize(authdomain.Actor{User: actor}, authdomain.ActionAdminOrganizer, authdomain.Resource{}); err != nil {
		return domain.Profile{}, domain.ErrAccessDenied
	}
	reason, err := ValidateReason(reason)
	if err != nil {
		return domain.Profile{}, err
	}
	p, err := s.Store.GetByID(ctx, id)
	if err != nil {
		return domain.Profile{}, err
	}
	next, err := domain.TargetStatus(p.Status, decision)
	if err != nil {
		return domain.Profile{}, domain.TransitionError{From: p.Status, Decision: decision}
	}
	before := p
	now := s.Now()
	p.Status = next
	p.DecisionReason = &reason
	p.DecidedAt = &now
	adminID := actor.ID
	p.DecidedByUserID = &adminID
	p.UpdatedAt = now
	action := "organizer.application." + stringsToAction(decision)
	err = s.inTx(ctx, func(ctx context.Context) error {
		if err := s.Store.Update(ctx, p, expectedVersion); err != nil {
			return err
		}
		p.Version = expectedVersion + 1
		if s.Notify != nil {
			typ := notifydomain.TypeOrganizerRejected
			path := "/organizer/status"
			switch decision {
			case domain.DecisionApprove:
				typ, path = notifydomain.TypeOrganizerApproved, "/organizer/events"
			case domain.DecisionSuspend:
				typ = notifydomain.TypeOrganizerSuspended
			case domain.DecisionRestore:
				typ, path = notifydomain.TypeOrganizerApproved, "/organizer/events"
			}
			if err := s.Notify.Enqueue(ctx, notifydomain.Command{
				DomainEventID: "organizer:" + string(decision) + ":" + p.ID,
				RecipientID:   p.OwnerUserID, Type: typ, EntityType: "OrganizerProfile", EntityID: p.ID, ActionPath: path,
			}); err != nil {
				return err
			}
		}
		return s.record(ctx, actor.ID, action, p, snapshot(before), snapshot(p))
	})
	if err != nil {
		return domain.Profile{}, err
	}
	switch decision {
	case domain.DecisionApprove:
		s.emit(ctx, "organizer_application_approved", actor.ID, p.ID)
	case domain.DecisionReject:
		s.emit(ctx, "organizer_application_rejected", actor.ID, p.ID)
	}
	return p, nil
}

func stringsToAction(d domain.Decision) string {
	switch d {
	case domain.DecisionApprove:
		return "approve"
	case domain.DecisionReject:
		return "reject"
	case domain.DecisionSuspend:
		return "suspend"
	case domain.DecisionRestore:
		return "restore"
	default:
		return "decide"
	}
}

func snapshot(p domain.Profile) map[string]any {
	return map[string]any{
		"id":      p.ID,
		"name":    p.Name,
		"status":  string(p.Status),
		"version": p.Version,
	}
}

func (s *Service) inTx(ctx context.Context, fn func(context.Context) error) error {
	if s.UoW == nil {
		return fn(ctx)
	}
	return s.UoW(ctx, fn)
}

func (s *Service) record(ctx context.Context, actorID, action string, p domain.Profile, before, after map[string]any) error {
	if s.Audit == nil {
		return nil
	}
	return s.Audit.Record(ctx, auditdomain.Record{
		ActorType:   auditdomain.ActorUser,
		ActorUserID: &actorID,
		Action:      action,
		EntityType:  "Organizer",
		EntityID:    &p.ID,
		Outcome:     auditdomain.OutcomeSuccess,
		Before:      before,
		After:       after,
		Metadata:    map[string]any{"source": "api"},
	})
}

func (s *Service) emit(ctx context.Context, name, actorID, entityID string) {
	if s.Analytics == nil {
		return
	}
	_ = s.Analytics.Emit(ctx, analyticsapp.Input{
		Name:        name,
		ActorUserID: actorID,
		EntityType:  "Organizer",
		EntityID:    entityID,
		Properties:  map[string]any{"source": "api", "entityType": "Organizer", "entityId": entityID},
	})
}

func (s *Service) limit(ctx context.Context, userID, ip string) error {
	if s.Rates == nil || s.HashKey == nil {
		return nil
	}
	n, err := s.Rates.Hit(ctx, s.HashKey("organizer|"+userID+"|"+ip), "organizer", 24*time.Hour)
	if err != nil {
		return err
	}
	if n > 3 {
		return domain.ErrRateLimited
	}
	return nil
}
