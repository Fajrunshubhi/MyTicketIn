package application

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"sort"
	"strings"
	"time"

	auditdomain "myticketin/internal/modules/audit/domain"
	authapp "myticketin/internal/modules/auth/application"
	authdomain "myticketin/internal/modules/auth/domain"
	orgdomain "myticketin/internal/modules/organizers/domain"
	"myticketin/internal/modules/reporting/domain"
	"myticketin/internal/platform/logger"
)

type Store interface {
	OrganizerID(ctx context.Context, ownerUserID string) (string, error)
	EventOwned(ctx context.Context, organizerID, eventID string) (bool, error)
	Aggregate(ctx context.Context, organizerID, eventID string, r domain.Range) (domain.Summary, error)
	ListEvents(ctx context.Context, organizerID string, r domain.Range, limit int, cursorAt *time.Time, cursorID string) ([]domain.EventRow, error)
	SalesBreakdown(ctx context.Context, organizerID, eventID string, r domain.Range) (events, categories, ticketTypes []domain.SalesBar, err error)
	SalesTrend(ctx context.Context, organizerID, eventID, bucket string, r domain.Range) ([]map[string]any, domain.Summary, string, error)
	ListParticipants(ctx context.Context, organizerID, eventID, ticketStatus, checkInResult string, r domain.Range, afterID string, limit int) ([]domain.Participant, error)
	ListQueue(ctx context.Context, queue string, limit int, cursorAt *time.Time, cursorID string) ([]domain.QueueItem, error)
	PublicEvent(ctx context.Context, slug string) (domain.Candidate, error)
	PaidSignals(ctx context.Context, buyerID string) (domain.Signal, error)
	Candidates(ctx context.Context, excludeID string, purchased []string, now time.Time) ([]domain.Candidate, error)
	Now(ctx context.Context) (time.Time, error)
}

type Auditor interface {
	Record(ctx context.Context, rec auditdomain.Record) error
}

type Limiter interface {
	Hit(ctx context.Context, keyHash, scope string, window time.Duration) (int, error)
}

type Service struct {
	Store        Store
	Audit        Auditor
	Rates        Limiter
	HashKey      func(raw string) string
	Secret       string
	UoW          func(ctx context.Context, fn func(context.Context) error) error
	EnableTrend  bool
	EnableSearch bool
	Now          func() time.Time
}

func NewService(store Store, secret string) *Service {
	return &Service{Store: store, Secret: secret, Now: func() time.Time { return time.Now().UTC() }}
}

func (s *Service) Dashboard(ctx context.Context, actor authdomain.User, eventID, from, to, cursor string, limit int) (map[string]any, error) {
	orgID, err := s.requireOrg(ctx, actor)
	if err != nil {
		return nil, err
	}
	if err := s.limit(ctx, actor.ID, "report-dashboard", 60, time.Minute); err != nil {
		return nil, err
	}
	rng, err := domain.ParseRange(from, to, s.Now())
	if err != nil {
		return nil, err
	}
	if eventID != "" {
		ok, err := s.Store.EventOwned(ctx, orgID, eventID)
		if err != nil || !ok {
			return nil, domain.ErrNotFound
		}
	}
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	var cursorAt *time.Time
	cursorID := ""
	if cursor != "" {
		t, id, err := s.decodeCursor("dash|"+orgID+"|"+eventID, cursor)
		if err != nil {
			return nil, domain.ErrCursorInvalid
		}
		cursorAt, cursorID = &t, id
	}
	var summary domain.Summary
	var rows []domain.EventRow
	var byEvent, byCategory, byType []domain.SalesBar
	asOf := s.Now()
	err = s.inTx(ctx, func(ctx context.Context) error {
		if t, err := s.Store.Now(ctx); err == nil {
			asOf = t
		}
		var err error
		summary, err = s.Store.Aggregate(ctx, orgID, eventID, rng)
		if err != nil {
			return err
		}
		rows, err = s.Store.ListEvents(ctx, orgID, rng, limit+1, cursorAt, cursorID)
		if err != nil {
			return err
		}
		byEvent, byCategory, byType, err = s.Store.SalesBreakdown(ctx, orgID, eventID, rng)
		return err
	})
	if err != nil {
		return nil, domain.ErrQueryFailed
	}
	next := ""
	if len(rows) > limit {
		last := rows[limit-1]
		next = s.encodeCursor("dash|"+orgID+"|"+eventID, last.StartsAt, last.ID)
		rows = rows[:limit]
	}
	events := make([]map[string]any, 0, len(rows))
	for _, e := range rows {
		events = append(events, map[string]any{
			"id": e.ID, "title": e.Title, "status": e.Status,
			"paidOrderCount": e.PaidOrderCount, "ticketsSold": e.TicketsSold,
			"grossSandboxRupiah": e.GrossSandboxRupiah, "checkInCount": e.CheckInCount,
		})
	}
	summary.AttendanceRate = domain.Attendance(summary.CheckInCount, summary.TicketsSold)
	if byEvent == nil {
		byEvent = []domain.SalesBar{}
	}
	if byCategory == nil {
		byCategory = []domain.SalesBar{}
	}
	if byType == nil {
		byType = []domain.SalesBar{}
	}
	return map[string]any{
		"summary": summary, "events": events, "nextCursor": next,
		"charts": map[string]any{
			"events": byEvent, "categories": byCategory, "ticketTypes": byType,
		},
		"range": map[string]any{"from": from, "to": to},
		"asOf":  asOf.UTC().Format(time.RFC3339Nano), "sandbox": true,
	}, nil
}

func (s *Service) Trend(ctx context.Context, actor authdomain.User, eventID, from, to, bucket string) (map[string]any, error) {
	if !s.EnableTrend {
		return nil, domain.ErrTrendDisabled
	}
	orgID, err := s.requireOrg(ctx, actor)
	if err != nil {
		return nil, err
	}
	ok, err := s.Store.EventOwned(ctx, orgID, eventID)
	if err != nil || !ok {
		return nil, domain.ErrNotFound
	}
	rng, err := domain.ParseRange(from, to, s.Now())
	if err != nil || rng.From == nil {
		return nil, domain.ErrRangeInvalid
	}
	if bucket != "week" {
		bucket = "day"
	}
	series, totals, tz, err := s.Store.SalesTrend(ctx, orgID, eventID, bucket, rng)
	if err != nil {
		return nil, domain.ErrQueryFailed
	}
	if tz == "" {
		tz = "Asia/Jakarta"
	}
	return map[string]any{"series": series, "totals": totals, "timezone": tz, "sandbox": true}, nil
}

func (s *Service) Export(ctx context.Context, actor authdomain.User, eventID, ticketStatus, checkInResult, from, to string, write func([]domain.Participant) error) error {
	orgID, err := s.requireOrg(ctx, actor)
	if err != nil {
		return err
	}
	ok, err := s.Store.EventOwned(ctx, orgID, eventID)
	if err != nil || !ok {
		return domain.ErrNotFound
	}
	if err := s.limit(ctx, actor.ID+"|"+eventID, "report-export", 5, time.Hour); err != nil {
		return domain.ErrExportRateLimited
	}
	rng, err := domain.ParseRange(from, to, s.Now())
	if err != nil {
		return err
	}
	if s.Audit != nil {
		eid := eventID
		if err := s.Audit.Record(ctx, auditdomain.Record{
			ActorType: auditdomain.ActorUser, ActorUserID: &actor.ID, Action: "report.export_requested",
			EntityType: "Event", EntityID: &eid, Outcome: auditdomain.OutcomeSuccess,
			After: map[string]any{"sandbox": true}, Metadata: map[string]any{"source": "api"},
			CorrelationID: logger.CorrelationFrom(ctx),
		}); err != nil {
			return err
		}
	}
	after := ""
	for {
		batch, err := s.Store.ListParticipants(ctx, orgID, eventID, ticketStatus, checkInResult, rng, after, 500)
		if err != nil {
			return domain.ErrExportFailed
		}
		if len(batch) == 0 {
			return nil
		}
		if err := write(batch); err != nil {
			return err
		}
		after = lastID(batch)
		if len(batch) < 500 {
			return nil
		}
	}
}

func lastID(batch []domain.Participant) string {
	if len(batch) == 0 {
		return ""
	}
	return batch[len(batch)-1].ID
}

func (s *Service) Operations(ctx context.Context, actor authdomain.User, queue, cursor string, limit int) (map[string]any, error) {
	if !actor.IsActive() || actor.Role != authdomain.RoleAdmin {
		return nil, domain.ErrAccessDenied
	}
	switch queue {
	case "moderation", "late-payment", "mismatch", "cancellation", "refund":
	default:
		queue = "moderation"
	}
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	var cursorAt *time.Time
	cursorID := ""
	if cursor != "" {
		t, id, err := s.decodeCursor("ops|"+queue, cursor)
		if err != nil {
			return nil, domain.ErrCursorInvalid
		}
		cursorAt, cursorID = &t, id
	}
	rows, err := s.Store.ListQueue(ctx, queue, limit+1, cursorAt, cursorID)
	if err != nil {
		return nil, domain.ErrQueryFailed
	}
	next := ""
	if len(rows) > limit {
		last := rows[limit-1]
		next = s.encodeCursor("ops|"+queue, last.OccurredAt, last.EntityID)
		rows = rows[:limit]
	}
	items := make([]map[string]any, 0, len(rows))
	for _, it := range rows {
		items = append(items, map[string]any{
			"entityType": it.EntityType, "entityId": it.EntityID, "reasonCode": it.ReasonCode,
			"status": it.Status, "occurredAt": it.OccurredAt.UTC().Format(time.RFC3339Nano), "safeSummary": it.SafeSummary,
		})
	}
	return map[string]any{"items": items, "nextCursor": next, "countsAsOf": s.Now().UTC().Format(time.RFC3339Nano), "sandbox": true}, nil
}

func (s *Service) Search(_ context.Context, actor authdomain.User, _, _ string) (map[string]any, error) {
	if !actor.IsActive() || actor.Role != authdomain.RoleAdmin {
		return nil, domain.ErrAccessDenied
	}
	if !s.EnableSearch {
		return nil, domain.ErrSearchDisabled
	}
	return nil, domain.ErrSearchDisabled
}

func (s *Service) Recommend(ctx context.Context, actor authdomain.User, authed bool, slug string, limit int) (map[string]any, error) {
	if limit < 1 {
		limit = 6
	}
	if limit > 12 {
		return nil, domain.ErrRecLimitInvalid
	}
	if err := s.limit(ctx, slug, "recommendation", 60, time.Minute); err != nil {
		return nil, err
	}
	current, err := s.Store.PublicEvent(ctx, slug)
	if err != nil {
		return nil, domain.ErrNotFound
	}
	now := s.Now()
	if t, err := s.Store.Now(ctx); err == nil {
		now = t
	}
	mode := "CONTEXTUAL"
	var sig domain.Signal
	var purchased []string
	if authed && actor.IsActive() {
		sig, err = s.Store.PaidSignals(ctx, actor.ID)
		if err != nil {
			return nil, domain.ErrRecUnavailable
		}
		if len(sig.Purchased) > 0 {
			mode = "HISTORY"
			for id := range sig.Purchased {
				purchased = append(purchased, id)
			}
		}
	}
	cands, err := s.Store.Candidates(ctx, current.ID, purchased, now)
	if err != nil {
		return nil, domain.ErrRecUnavailable
	}
	type scored struct {
		c      domain.Candidate
		score  int
		reason string
	}
	var ranked []scored
	for _, c := range cands {
		var score int
		var reason string
		if mode == "HISTORY" {
			if _, ok := sig.Purchased[c.ID]; ok {
				continue
			}
			score, reason = domain.ScoreHistory(c, sig)
		} else {
			score, reason = domain.ScoreContextual(c, current)
		}
		if score <= 0 {
			continue
		}
		ranked = append(ranked, scored{c, score, reason})
	}
	sort.SliceStable(ranked, func(i, j int) bool {
		if ranked[i].score != ranked[j].score {
			return ranked[i].score > ranked[j].score
		}
		if !ranked[i].c.StartsAt.Equal(ranked[j].c.StartsAt) {
			return ranked[i].c.StartsAt.Before(ranked[j].c.StartsAt)
		}
		return ranked[i].c.ID < ranked[j].c.ID
	})
	if len(ranked) > limit {
		ranked = ranked[:limit]
	}
	items := make([]map[string]any, 0, len(ranked))
	for _, r := range ranked {
		items = append(items, map[string]any{
			"slug": r.c.Slug, "title": r.c.Title, "category": r.c.Category, "city": r.c.City, "province": r.c.Province,
			"startsAt": r.c.StartsAt.UTC().Format(time.RFC3339), "timezone": r.c.Timezone,
			"organizer": map[string]any{"name": r.c.OrganizerName},
			"image":     map[string]any{"url": "/placeholder-event.svg", "altText": "Placeholder gambar event"},
			"reason":    r.reason,
		})
	}
	return map[string]any{"items": items, "mode": mode, "asOf": now.UTC().Format(time.RFC3339Nano)}, nil
}

func (s *Service) requireOrg(ctx context.Context, actor authdomain.User) (string, error) {
	if !actor.IsActive() || actor.Role == authdomain.RoleAdmin {
		return "", domain.ErrOrganizerRequired
	}
	id, err := s.Store.OrganizerID(ctx, actor.ID)
	if err != nil {
		if err == orgdomain.ErrNotApproved || err == orgdomain.ErrRequired || err == orgdomain.ErrNotFound {
			return "", domain.ErrOrganizerRequired
		}
		return "", err
	}
	return id, nil
}

func (s *Service) inTx(ctx context.Context, fn func(context.Context) error) error {
	if s.UoW == nil {
		return fn(ctx)
	}
	return s.UoW(ctx, fn)
}

func (s *Service) limit(ctx context.Context, id, scope string, max int, window time.Duration) error {
	if s.Rates == nil || s.HashKey == nil {
		return nil
	}
	n, err := s.Rates.Hit(ctx, s.HashKey(authapp.HashRateKey(scope, "", id)), scope, window)
	if err != nil {
		return domain.ErrQueryFailed
	}
	if n > max {
		return domain.ErrRateLimited
	}
	return nil
}

func (s *Service) encodeCursor(filter string, at time.Time, id string) string {
	payload := at.UTC().Format(time.RFC3339Nano) + "|" + id
	mac := hmac.New(sha256.New, []byte(s.Secret))
	_, _ = mac.Write([]byte(filter + "|" + payload))
	return hex.EncodeToString(mac.Sum(nil))[:16] + "." + hex.EncodeToString([]byte(payload))
}

func (s *Service) decodeCursor(filter, raw string) (time.Time, string, error) {
	parts := strings.SplitN(raw, ".", 2)
	if len(parts) != 2 {
		return time.Time{}, "", domain.ErrCursorInvalid
	}
	payload, err := hex.DecodeString(parts[1])
	if err != nil {
		return time.Time{}, "", domain.ErrCursorInvalid
	}
	mac := hmac.New(sha256.New, []byte(s.Secret))
	_, _ = mac.Write([]byte(filter + "|" + string(payload)))
	if hex.EncodeToString(mac.Sum(nil))[:16] != parts[0] {
		return time.Time{}, "", domain.ErrCursorInvalid
	}
	bits := strings.SplitN(string(payload), "|", 2)
	if len(bits) != 2 {
		return time.Time{}, "", domain.ErrCursorInvalid
	}
	tm, err := time.Parse(time.RFC3339Nano, bits[0])
	return tm, bits[1], err
}
