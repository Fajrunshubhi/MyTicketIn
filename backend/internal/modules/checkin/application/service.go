package application

import (
	"context"
	"errors"
	"strings"
	"time"

	analyticsapp "myticketin/internal/modules/analytics/application"
	auditdomain "myticketin/internal/modules/audit/domain"
	authapp "myticketin/internal/modules/auth/application"
	authdomain "myticketin/internal/modules/auth/domain"
	"myticketin/internal/modules/checkin/domain"
	eventdomain "myticketin/internal/modules/events/domain"
	orgdomain "myticketin/internal/modules/organizers/domain"
	ticketdomain "myticketin/internal/modules/tickets/domain"
	"myticketin/internal/platform/db"
	"myticketin/internal/platform/logger"
)

type Store interface {
	GetEvent(ctx context.Context, id string) (eventdomain.Event, error)
	GetStaffByUser(ctx context.Context, eventID, userID string) (eventdomain.StaffAssignment, error)
	GetProfile(ctx context.Context, id string) (orgdomain.Profile, error)
	LookupQR(ctx context.Context, tokenHash string) (*domain.TicketView, error)
	LookupManual(ctx context.Context, code string) (*domain.TicketView, error)
	MarkUsed(ctx context.Context, ticketID, eventID, actorID string, now time.Time) (bool, *time.Time, error)
	GetAttemptByKey(ctx context.Context, operatorID, eventID, keyHash string) (domain.Attempt, error)
	InsertAttempt(ctx context.Context, a domain.Attempt) error
	ListAttempts(ctx context.Context, eventID, result string, from, to *time.Time, limit int, cursorAt *time.Time, cursorID string) ([]domain.Attempt, error)
	GetUserName(ctx context.Context, id string) (string, error)
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

type Service struct {
	Store     Store
	Pepper    string
	FPKey     string
	Audit     Auditor
	Analytics Analytics
	Rates     Limiter
	HashKey   func(raw string) string
	UoW       func(ctx context.Context, fn func(context.Context) error) error
	Now       func() time.Time
}

func NewService(store Store, pepper, fpKey string) *Service {
	return &Service{Store: store, Pepper: pepper, FPKey: fpKey, Now: func() time.Time { return time.Now().UTC() }}
}

type Access struct {
	Event       map[string]any `json:"event"`
	Permissions map[string]any `json:"permissions"`
}

type Response struct {
	AttemptID  string         `json:"attemptId"`
	Result     domain.Result  `json:"result"`
	ReasonCode string         `json:"reasonCode"`
	Message    string         `json:"message"`
	FirstUsed  *string        `json:"firstUsedAt,omitempty"`
	Ticket     map[string]any `json:"ticket,omitempty"`
	ServerTime string         `json:"serverTime"`
}

func (s *Service) ScannerAccess(ctx context.Context, actor authdomain.User, eventID string) (Access, error) {
	ev, err := s.requireOperator(ctx, actor, eventID, false)
	if err != nil {
		return Access{}, err
	}
	return Access{
		Event: map[string]any{
			"id": ev.ID, "title": ev.Title, "startsAt": ev.StartsAt.UTC().Format(time.RFC3339),
			"timezone": ev.Timezone, "venueName": ev.VenueName,
		},
		Permissions: map[string]any{"scan": true, "manualEntry": true},
	}, nil
}

func (s *Service) CheckIn(ctx context.Context, actor authdomain.User, eventID string, in domain.Input, idemKey, ip string) (Response, error) {
	started := time.Now()
	if err := domain.ValidateIdempotencyKey(idemKey); err != nil {
		return Response{}, err
	}
	if in.Type != domain.InputQR && in.Type != domain.InputManual {
		return Response{}, domain.ErrRequestInvalid
	}
	if strings.TrimSpace(in.Raw) == "" || len(in.Raw) > 200 {
		return Response{}, domain.ErrRequestInvalid
	}
	ev, err := s.requireOperator(ctx, actor, eventID, false)
	if err != nil {
		return Response{}, err
	}
	if err := s.limitScan(ctx, actor.ID, eventID, ip, in.Type); err != nil {
		return Response{}, err
	}
	normalized, formatOK := domain.Normalize(in)
	reqHash := domain.RequestHash(in.Type, normalized)
	keyHash := domain.KeyHash(idemKey)
	fp := domain.Fingerprint(s.FPKey, normalized)
	ctxMap := domain.SanitizeContext(in.Context)
	corr := logger.CorrelationFrom(ctx)
	crypto := ticketdomain.Crypto{Pepper: s.Pepper}
	var tokenHash string
	if formatOK && in.Type == domain.InputQR {
		tokenHash = crypto.Hash(normalized)
	}

	var out Response
	err = s.inTx(ctx, func(ctx context.Context) error {
		if existing, err := s.Store.GetAttemptByKey(ctx, actor.ID, eventID, keyHash); err == nil {
			if existing.RequestHash != reqHash {
				return domain.ErrKeyReused
			}
			out = s.toResponse(existing)
			return nil
		} else if !errors.Is(err, domain.ErrNotFound) {
			return err
		}
		var ticket *domain.TicketView
		if formatOK {
			if in.Type == domain.InputQR {
				ticket, err = s.Store.LookupQR(ctx, tokenHash)
			} else {
				ticket, err = s.Store.LookupManual(ctx, normalized)
			}
			if err != nil {
				return err
			}
		}
		result, reason := domain.ResultInvalid, domain.ReasonFormat
		if formatOK {
			result, reason = domain.Classify(ticket, eventID, string(ev.Status))
		}
		now := s.Now()
		var first *time.Time
		if result == domain.ResultValid && ticket != nil {
			ok, usedAt, err := s.Store.MarkUsed(ctx, ticket.ID, eventID, actor.ID, now)
			if err != nil {
				return err
			}
			if ok {
				first = usedAt
				if first == nil {
					first = &now
				}
				ticket.Status = "USED"
				ticket.UsedAt = first
			} else {
				fresh, err := s.Store.LookupQR(ctx, tokenHash)
				if in.Type == domain.InputManual {
					fresh, err = s.Store.LookupManual(ctx, normalized)
				}
				if err != nil {
					return err
				}
				result, reason = domain.Classify(fresh, eventID, string(ev.Status))
				if result == domain.ResultValid {
					result, reason = domain.ResultAlreadyUsed, domain.ReasonAlreadyUsed
				}
				if fresh != nil {
					ticket = fresh
					first = fresh.UsedAt
				}
			}
		}
		if result == domain.ResultAlreadyUsed && first == nil && ticket != nil {
			first = ticket.UsedAt
			if first == nil {
				first = &now
			}
		}
		dur := int(time.Since(started).Milliseconds())
		if dur < 0 {
			dur = 0
		}
		id, err := db.NewID()
		if err != nil {
			return err
		}
		a := domain.Attempt{
			ID: id, EventID: eventID, OperatorUserID: actor.ID, InputType: in.Type, Result: result, ReasonCode: reason,
			AttemptedAt: now, FirstUsedAt: first, InputFingerprint: fp, IdempotencyHash: keyHash, RequestHash: reqHash,
			CorrelationID: corr, DurationMS: dur, ClientContext: ctxMap,
		}
		if ticket != nil {
			tid := ticket.ID
			a.TicketID = &tid
			a.TicketNumber = ticket.TicketNumber
			a.TicketTypeName = ticket.TicketTypeName
			a.SectionName = ticket.SectionName
			a.SeatLabel = ticket.SeatLabel
		}
		if err := s.Store.InsertAttempt(ctx, a); err != nil {
			if existing, rerr := s.Store.GetAttemptByKey(ctx, actor.ID, eventID, keyHash); rerr == nil {
				if existing.RequestHash != reqHash {
					return domain.ErrKeyReused
				}
				out = s.toResponse(existing)
				return nil
			}
			return err
		}
		if result == domain.ResultValid {
			if err := s.record(ctx, actor.ID, "checkin.valid", a.ID, map[string]any{"eventId": eventID, "result": string(result)}); err != nil {
				return err
			}
		}
		out = s.toResponse(a)
		return nil
	})
	if err != nil {
		return Response{}, err
	}
	if out.Result == domain.ResultInvalid {
		_ = s.limitInvalid(ctx, actor.ID, ip)
	}
	s.emit(ctx, out, eventID, actor.ID)
	return out, nil
}

type AttemptItem struct {
	ID           string  `json:"id"`
	Result       string  `json:"result"`
	ReasonCode   string  `json:"reasonCode"`
	AttemptedAt  string  `json:"attemptedAt"`
	FirstUsedAt  *string `json:"firstUsedAt,omitempty"`
	TicketMasked *string `json:"ticketNumberMasked,omitempty"`
	OperatorName string  `json:"operatorName"`
}

func (s *Service) ListAttempts(ctx context.Context, actor authdomain.User, eventID, result, from, to, cursor string, limit int) ([]AttemptItem, string, error) {
	if _, err := s.requireOperator(ctx, actor, eventID, true); err != nil {
		return nil, "", err
	}
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	var fromT, toT *time.Time
	if from != "" {
		t, err := time.Parse(time.RFC3339, from)
		if err != nil {
			return nil, "", domain.ErrRequestInvalid
		}
		fromT = &t
	}
	if to != "" {
		t, err := time.Parse(time.RFC3339, to)
		if err != nil {
			return nil, "", domain.ErrRequestInvalid
		}
		toT = &t
	}
	var cursorAt *time.Time
	cursorID := ""
	if cursor != "" {
		parts := strings.SplitN(cursor, "|", 2)
		if len(parts) != 2 {
			return nil, "", domain.ErrRequestInvalid
		}
		t, err := time.Parse(time.RFC3339Nano, parts[0])
		if err != nil {
			return nil, "", domain.ErrRequestInvalid
		}
		cursorAt, cursorID = &t, parts[1]
	}
	rows, err := s.Store.ListAttempts(ctx, eventID, strings.ToUpper(strings.TrimSpace(result)), fromT, toT, limit+1, cursorAt, cursorID)
	if err != nil {
		return nil, "", err
	}
	next := ""
	if len(rows) > limit {
		last := rows[limit-1]
		next = last.AttemptedAt.UTC().Format(time.RFC3339Nano) + "|" + last.ID
		rows = rows[:limit]
	}
	items := make([]AttemptItem, 0, len(rows))
	for _, a := range rows {
		name, _ := s.Store.GetUserName(ctx, a.OperatorUserID)
		it := AttemptItem{ID: a.ID, Result: string(a.Result), ReasonCode: a.ReasonCode, AttemptedAt: a.AttemptedAt.UTC().Format(time.RFC3339Nano), OperatorName: name}
		if a.FirstUsedAt != nil {
			v := a.FirstUsedAt.UTC().Format(time.RFC3339Nano)
			it.FirstUsedAt = &v
		}
		if a.TicketNumber != "" && a.Result != domain.ResultWrongEvent && a.Result != domain.ResultInvalid {
			masked := domain.MaskNumber(a.TicketNumber)
			it.TicketMasked = &masked
		}
		items = append(items, it)
	}
	return items, next, nil
}

func (s *Service) requireOperator(ctx context.Context, actor authdomain.User, eventID string, history bool) (eventdomain.Event, error) {
	if !actor.IsActive() {
		return eventdomain.Event{}, domain.ErrAccessDenied
	}
	ev, err := s.Store.GetEvent(ctx, eventID)
	if err != nil {
		return eventdomain.Event{}, domain.ErrNotFound
	}
	if history && actor.Role == authdomain.RoleAdmin {
		return ev, nil
	}
	prof, err := s.Store.GetProfile(ctx, ev.OrganizerProfileID)
	if err == nil && prof.OwnerUserID == actor.ID {
		return ev, nil
	}
	if history {
		return eventdomain.Event{}, domain.ErrNotFound
	}
	st, err := s.Store.GetStaffByUser(ctx, eventID, actor.ID)
	if err != nil || st.Status != eventdomain.StaffActive {
		return eventdomain.Event{}, domain.ErrNotFound
	}
	return ev, nil
}

func (s *Service) toResponse(a domain.Attempt) Response {
	out := Response{
		AttemptID: a.ID, Result: a.Result, ReasonCode: a.ReasonCode, Message: domain.Message(a.Result),
		ServerTime: a.AttemptedAt.UTC().Format(time.RFC3339Nano),
	}
	if a.FirstUsedAt != nil {
		v := a.FirstUsedAt.UTC().Format(time.RFC3339Nano)
		out.FirstUsed = &v
	}
	show := a.Result == domain.ResultValid || a.Result == domain.ResultAlreadyUsed || a.Result == domain.ResultCancelled
	if show && a.TicketNumber != "" {
		out.Ticket = map[string]any{
			"ticketNumberMasked": domain.MaskNumber(a.TicketNumber),
			"ticketTypeName":     a.TicketTypeName,
			"sectionName":        a.SectionName,
			"seatLabel":          a.SeatLabel,
		}
	}
	return out
}

func (s *Service) inTx(ctx context.Context, fn func(context.Context) error) error {
	if s.UoW == nil {
		return fn(ctx)
	}
	return s.UoW(ctx, fn)
}

func (s *Service) limitScan(ctx context.Context, userID, eventID, ip string, kind domain.InputType) error {
	if s.Rates == nil || s.HashKey == nil {
		return nil
	}
	scope := "checkin-qr"
	max := 120
	if kind == domain.InputManual {
		scope = "checkin-manual"
		max = 20
	}
	n, err := s.Rates.Hit(ctx, s.HashKey(authapp.HashRateKey(scope, eventID, userID)), scope, time.Minute)
	if err != nil {
		return domain.ErrUnavailable
	}
	if n > max {
		return domain.ErrRateLimited
	}
	_ = ip
	return nil
}

func (s *Service) limitInvalid(ctx context.Context, userID, ip string) error {
	if s.Rates == nil || s.HashKey == nil {
		return nil
	}
	n, err := s.Rates.Hit(ctx, s.HashKey(authapp.HashRateKey("checkin-invalid", ip, userID)), "checkin-invalid", time.Minute)
	if err != nil {
		return nil
	}
	if n > 20 {
		return domain.ErrRateLimited
	}
	return nil
}

func (s *Service) record(ctx context.Context, actorID, action, entityID string, after map[string]any) error {
	if s.Audit == nil {
		return nil
	}
	entity := entityID
	return s.Audit.Record(ctx, auditdomain.Record{
		ActorType: auditdomain.ActorUser, ActorUserID: &actorID, Action: action, EntityType: "CheckInAttempt", EntityID: &entity,
		Outcome: auditdomain.OutcomeSuccess, After: after, Metadata: map[string]any{"source": "api"},
		CorrelationID: logger.CorrelationFrom(ctx),
	})
}

func (s *Service) emit(ctx context.Context, out Response, eventID, actorID string) {
	if s.Analytics == nil {
		return
	}
	name := "checkin_rejected"
	if out.Result == domain.ResultValid {
		name = "checkin_succeeded"
	}
	_ = s.Analytics.Emit(ctx, analyticsapp.Input{
		Name: name, ActorUserID: actorID, EntityType: "Event", EntityID: eventID,
		Properties:       map[string]any{"source": "api", "entityType": "Event", "entityId": eventID, "reasonCode": out.ReasonCode},
		DeduplicationKey: "checkin:" + out.AttemptID,
	})
}
