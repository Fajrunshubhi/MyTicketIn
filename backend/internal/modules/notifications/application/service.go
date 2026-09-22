package application

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	authapp "myticketin/internal/modules/auth/application"
	authdomain "myticketin/internal/modules/auth/domain"
	"myticketin/internal/modules/notifications/domain"
	platdb "myticketin/internal/platform/db"
)

type Store interface {
	InsertOutbox(ctx context.Context, row domain.OutboxRow) error
	ClaimDue(ctx context.Context, limit int, worker string, now time.Time) ([]domain.OutboxRow, error)
	CompleteOutbox(ctx context.Context, id string, now time.Time) error
	FailOutbox(ctx context.Context, id string, attempts int, next time.Time, code string, terminal bool) error
	ReclaimStale(ctx context.Context, olderThan time.Time) error
	UpsertInApp(ctx context.Context, n domain.Notification) (domain.Notification, error)
	UpsertDelivery(ctx context.Context, notificationID string, ch domain.Channel, status domain.DeliveryStatus, provider, msgID, templateKey, errCode string, attempts int, sentAt *time.Time) error
	List(ctx context.Context, userID, filter string, limit int, cursorAt *time.Time, cursorID string) ([]domain.Notification, error)
	UnreadCount(ctx context.Context, userID string) (int, error)
	Get(ctx context.Context, id string) (domain.Notification, error)
	MarkRead(ctx context.Context, id, userID string, now time.Time) (time.Time, error)
	MarkReadAll(ctx context.Context, userID string, before time.Time) (int, error)
	ListReminderCandidates(ctx context.Context, now time.Time, afterEventID, afterUserID string, limit int) ([]domain.ReminderCandidate, error)
	ReminderEligible(ctx context.Context, eventID, userID string, now time.Time) (bool, error)
	CancelledRecipients(ctx context.Context, eventID string) ([]string, error)
}

type Mailer interface {
	ProviderName() string
	Send(ctx context.Context, in domain.EmailMessage) (string, error)
}

type Mail = domain.EmailMessage

type Limiter interface {
	Hit(ctx context.Context, keyHash, scope string, window time.Duration) (int, error)
}

type Service struct {
	Store   Store
	Mailer  Mailer
	Rates   Limiter
	HashKey func(raw string) string
	Secret  string
	Worker  string
	Now     func() time.Time
}

func NewService(store Store, mailer Mailer, secret string) *Service {
	return &Service{Store: store, Mailer: mailer, Secret: secret, Worker: "api", Now: func() time.Time { return time.Now().UTC() }}
}

func (s *Service) Enqueue(ctx context.Context, cmd domain.Command) error {
	_, err := s.enqueue(ctx, cmd)
	return err
}

func (s *Service) enqueue(ctx context.Context, cmd domain.Command) (bool, error) {
	if cmd.RecipientID == "" || cmd.DomainEventID == "" || cmd.Type == "" {
		return false, domain.ErrPayloadInvalid
	}
	id, err := platdb.NewID()
	if err != nil {
		return false, err
	}
	payload := cmd.Payload
	if payload == nil {
		payload = map[string]any{}
	}
	payload["entityType"] = cmd.EntityType
	payload["entityId"] = cmd.EntityID
	payload["actionPath"] = domain.SafeActionPath(cmd.ActionPath)
	row := domain.OutboxRow{
		ID: id, DomainEventID: cmd.DomainEventID, RecipientID: cmd.RecipientID, Type: cmd.Type,
		Payload: payload, Status: domain.OutboxPending, NextAttemptAt: s.Now(),
	}
	err = s.Store.InsertOutbox(ctx, row)
	if err != nil && isUnique(err) {
		return false, nil
	}
	return err == nil, err
}

func (s *Service) RecipientsForCancelledEvent(ctx context.Context, eventID string) ([]string, error) {
	return s.Store.CancelledRecipients(ctx, eventID)
}

func (s *Service) Dispatch(ctx context.Context, limit int) (int, error) {
	if limit <= 0 || limit > 50 {
		limit = 50
	}
	_ = s.Store.ReclaimStale(ctx, s.Now().Add(-10*time.Minute))
	rows, err := s.Store.ClaimDue(ctx, limit, s.Worker, s.Now())
	if err != nil {
		return 0, domain.ErrJobFailed
	}
	ok := 0
	for _, row := range rows {
		if err := s.dispatchOne(ctx, row); err != nil {
			next := domain.Backoff(row.AttemptCount+1, s.Now())
			terminal := row.AttemptCount+1 >= domain.MaxAttempts
			_ = s.Store.FailOutbox(ctx, row.ID, row.AttemptCount+1, next, errCode(err), terminal)
			continue
		}
		if err := s.Store.CompleteOutbox(ctx, row.ID, s.Now()); err != nil {
			continue
		}
		ok++
	}
	return ok, nil
}

func (s *Service) dispatchOne(ctx context.Context, row domain.OutboxRow) error {
	title, body, action, tmpl := domain.Template(row.Type)
	if p, _ := row.Payload["title"].(string); p != "" {
		title = p
	}
	if p, _ := row.Payload["body"].(string); p != "" {
		body = p
	}
	if p, _ := row.Payload["actionPath"].(string); domain.SafeActionPath(p) != "" {
		action = domain.SafeActionPath(p)
	}
	path := action
	entityType, _ := row.Payload["entityType"].(string)
	entityID, _ := row.Payload["entityId"].(string)
	note := domain.Notification{
		RecipientID: row.RecipientID, Type: row.Type, Title: title, Body: body, ActionPath: &path,
		DedupKey:  domain.DedupKey(row.DomainEventID, row.RecipientID, row.Type, domain.ChannelInApp),
		CreatedAt: s.Now(),
	}
	if entityType != "" && entityID != "" {
		note.EntityType, note.EntityID = &entityType, &entityID
	}
	n, err := s.Store.UpsertInApp(ctx, note)
	if err != nil {
		return err
	}
	_ = s.Store.UpsertDelivery(ctx, n.ID, domain.ChannelInApp, domain.DeliverySent, "in-app", n.ID, tmpl, "", 1, ptrTime(s.Now()))
	if s.Mailer == nil {
		return domain.ErrEmailNotConfigured
	}
	msgID, err := s.Mailer.Send(ctx, domain.EmailMessage{
		TemplateKey: tmpl, Idempotency: row.DomainEventID + "|" + row.RecipientID + "|EMAIL",
		Subject: "[SANDBOX] " + title, TextBody: body + "\n\nBuka aplikasi MyTicketIn. Transaksi uji, bukan uang nyata.",
	})
	if err != nil {
		_ = s.Store.UpsertDelivery(ctx, n.ID, domain.ChannelEmail, domain.DeliveryFailed, s.Mailer.ProviderName(), "", tmpl, errCode(err), row.AttemptCount+1, nil)
		return err
	}
	return s.Store.UpsertDelivery(ctx, n.ID, domain.ChannelEmail, domain.DeliverySent, s.Mailer.ProviderName(), msgID, tmpl, "", row.AttemptCount+1, ptrTime(s.Now()))
}

func (s *Service) List(ctx context.Context, actor authdomain.User, filter, cursor string, limit int) (map[string]any, error) {
	if !actor.IsActive() {
		return nil, domain.ErrAccessDenied
	}
	if err := s.limit(ctx, actor.ID, "notify-inbox", 120, time.Minute); err != nil {
		return nil, err
	}
	if filter != "unread" {
		filter = "all"
	}
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	var cursorAt *time.Time
	cursorID := ""
	if cursor != "" {
		t, id, err := s.decodeCursor(actor.ID, cursor)
		if err != nil {
			return nil, domain.ErrCursorInvalid
		}
		cursorAt, cursorID = &t, id
	}
	rows, err := s.Store.List(ctx, actor.ID, filter, limit+1, cursorAt, cursorID)
	if err != nil {
		return nil, err
	}
	unread, err := s.Store.UnreadCount(ctx, actor.ID)
	if err != nil {
		return nil, err
	}
	next := ""
	if len(rows) > limit {
		last := rows[limit-1]
		next = s.encodeCursor(actor.ID, last.CreatedAt, last.ID)
		rows = rows[:limit]
	}
	items := make([]map[string]any, 0, len(rows))
	for _, n := range rows {
		items = append(items, map[string]any{
			"id": n.ID, "type": n.Type, "title": n.Title, "body": n.Body,
			"actionPath": n.ActionPath, "createdAt": n.CreatedAt.UTC().Format(time.RFC3339Nano), "readAt": formatTime(n.ReadAt),
		})
	}
	return map[string]any{"items": items, "unreadCount": unread, "nextCursor": next}, nil
}

func (s *Service) MarkRead(ctx context.Context, actor authdomain.User, id string) (map[string]any, error) {
	if !actor.IsActive() {
		return nil, domain.ErrAccessDenied
	}
	n, err := s.Store.Get(ctx, id)
	if err != nil || n.RecipientID != actor.ID {
		return nil, domain.ErrNotFound
	}
	at, err := s.Store.MarkRead(ctx, id, actor.ID, s.Now())
	if err != nil {
		return nil, domain.ErrNotFound
	}
	return map[string]any{"id": id, "readAt": at.UTC().Format(time.RFC3339Nano)}, nil
}

func (s *Service) MarkReadAll(ctx context.Context, actor authdomain.User, before string) (map[string]any, error) {
	if !actor.IsActive() {
		return nil, domain.ErrAccessDenied
	}
	at := s.Now()
	if strings.TrimSpace(before) != "" {
		t, err := time.Parse(time.RFC3339, before)
		if err != nil {
			return nil, domain.ErrCursorInvalid
		}
		at = t
	}
	n, err := s.Store.MarkReadAll(ctx, actor.ID, at)
	if err != nil {
		return nil, err
	}
	return map[string]any{"updatedCount": n, "readAt": at.UTC().Format(time.RFC3339Nano)}, nil
}

func (s *Service) ProduceReminders(ctx context.Context, batch int) (map[string]any, error) {
	start := s.Now()
	if batch <= 0 || batch > 500 {
		batch = 100
	}
	now := start
	scanned, enqueued, skipped := 0, 0, 0
	afterEvent, afterUser := "", ""
	for scanned < batch {
		remain := batch - scanned
		if remain > 100 {
			remain = 100
		}
		cands, err := s.Store.ListReminderCandidates(ctx, now, afterEvent, afterUser, remain)
		if err != nil {
			return nil, domain.ErrJobFailed
		}
		if len(cands) == 0 {
			break
		}
		for _, c := range cands {
			scanned++
			ok, err := s.Store.ReminderEligible(ctx, c.EventID, c.RecipientID, now)
			if err != nil || !ok {
				skipped++
				afterEvent, afterUser = c.EventID, c.RecipientID
				continue
			}
			title, body, action, _ := domain.Template(domain.TypeEventReminder)
			body = "Event \"" + c.Title + "\" di " + c.Venue + " dimulai dalam 24 jam (zona " + c.Timezone + "). SANDBOX/UJI."
			created, err := s.enqueue(ctx, domain.Command{
				DomainEventID: domain.ReminderDomainEvent(c.EventID, c.RecipientID),
				RecipientID:   c.RecipientID,
				Type:          domain.TypeEventReminder,
				EntityType:    "Event",
				EntityID:      c.EventID,
				ActionPath:    action,
				Payload:       map[string]any{"title": title, "body": body},
			})
			if err != nil {
				skipped++
			} else if created {
				enqueued++
			} else {
				skipped++
			}
			afterEvent, afterUser = c.EventID, c.RecipientID
		}
		if len(cands) < remain {
			break
		}
	}
	_, _ = s.Dispatch(ctx, 50)
	return map[string]any{
		"scanned": scanned, "enqueued": enqueued, "skipped": skipped,
		"hasMore": scanned >= batch, "durationMs": time.Since(start).Milliseconds(),
	}, nil
}

func (s *Service) limit(ctx context.Context, id, scope string, max int, window time.Duration) error {
	if s.Rates == nil || s.HashKey == nil {
		return nil
	}
	n, err := s.Rates.Hit(ctx, s.HashKey(authapp.HashRateKey(scope, "", id)), scope, window)
	if err != nil {
		return domain.ErrJobFailed
	}
	if n > max {
		return authdomain.ErrRateLimited
	}
	return nil
}

func (s *Service) encodeCursor(userID string, at time.Time, id string) string {
	payload := at.UTC().Format(time.RFC3339Nano) + "|" + id
	mac := hmac.New(sha256.New, []byte(s.Secret))
	_, _ = mac.Write([]byte(userID + "|" + payload))
	return hex.EncodeToString(mac.Sum(nil))[:16] + "." + hex.EncodeToString([]byte(payload))
}

func (s *Service) decodeCursor(userID, raw string) (time.Time, string, error) {
	parts := strings.SplitN(raw, ".", 2)
	if len(parts) != 2 {
		return time.Time{}, "", domain.ErrCursorInvalid
	}
	payload, err := hex.DecodeString(parts[1])
	if err != nil {
		return time.Time{}, "", domain.ErrCursorInvalid
	}
	mac := hmac.New(sha256.New, []byte(s.Secret))
	_, _ = mac.Write([]byte(userID + "|" + string(payload)))
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

func formatTime(t *time.Time) any {
	if t == nil {
		return nil
	}
	return t.UTC().Format(time.RFC3339Nano)
}

func ptrTime(t time.Time) *time.Time { return &t }

func errCode(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func isUnique(err error) bool {
	return err != nil && (errors.Is(err, errUnique) || strings.Contains(strings.ToLower(err.Error()), "unique") || strings.Contains(err.Error(), "23505"))
}

var errUnique = errors.New("unique")

func MustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
