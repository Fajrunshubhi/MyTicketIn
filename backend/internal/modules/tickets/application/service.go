package application

import (
	"context"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	analyticsapp "myticketin/internal/modules/analytics/application"
	auditdomain "myticketin/internal/modules/audit/domain"
	authapp "myticketin/internal/modules/auth/application"
	authdomain "myticketin/internal/modules/auth/domain"
	eventdomain "myticketin/internal/modules/events/domain"
	notifydomain "myticketin/internal/modules/notifications/domain"
	orderdomain "myticketin/internal/modules/orders/domain"
	"myticketin/internal/modules/payments/domain"
	ticketdomain "myticketin/internal/modules/tickets/domain"
	"myticketin/internal/platform/db"
	"myticketin/internal/platform/logger"
)

type Store interface {
	ClaimIssuance(ctx context.Context, run ticketdomain.IssuanceRun) (ticketdomain.IssuanceRun, bool, error)
	CompleteIssuance(ctx context.Context, run ticketdomain.IssuanceRun) error
	GetIssuance(ctx context.Context, orderID string) (ticketdomain.IssuanceRun, error)
	HasUnit(ctx context.Context, orderItemID string, seq int) (bool, error)
	InsertTicket(ctx context.Context, t ticketdomain.Ticket) error
	CountOrder(ctx context.Context, orderID string) (int, error)
	CountUsed(ctx context.Context, orderID string) (int, error)
	ListOwner(ctx context.Context, ownerID, status string, limit int, cursorAt *time.Time, cursorID string) ([]ticketdomain.Ticket, error)
	Get(ctx context.Context, id string) (ticketdomain.Ticket, error)
	GetEvent(ctx context.Context, id string) (eventdomain.Event, error)
	GetOrder(ctx context.Context, id string) (orderdomain.Order, error)
	GetUserName(ctx context.Context, id string) (string, error)
	CancelUnused(ctx context.Context, orderID, eventID, source, ref string, now time.Time) (int, error)
	ListPaidIncomplete(ctx context.Context, limit int) ([]orderdomain.Order, error)
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

type QRRenderer interface {
	PNG(token string, size int) ([]byte, error)
}

type Service struct {
	Store     Store
	Crypto    ticketdomain.Crypto
	QR        QRRenderer
	Audit     Auditor
	Analytics Analytics
	Rates     Limiter
	HashKey   func(raw string) string
	UoW       func(ctx context.Context, fn func(context.Context) error) error
	Now       func() time.Time
	Notify    interface {
		Enqueue(ctx context.Context, cmd notifydomain.Command) error
	}
}

func NewService(store Store, crypto ticketdomain.Crypto, qr QRRenderer) *Service {
	return &Service{Store: store, Crypto: crypto, QR: qr, Now: func() time.Time { return time.Now().UTC() }}
}

func (s *Service) CanRefund(orderID string) error {
	n, err := s.Store.CountUsed(context.Background(), orderID)
	if err != nil {
		return err
	}
	if n > 0 {
		return domain.ErrFulfillmentBlocked
	}
	return nil
}

func (s *Service) IssueForPaidOrder(ctx context.Context, order orderdomain.Order, corr string) error {
	if order.Status != orderdomain.StatusPaid {
		return ticketdomain.ErrIssuanceInvariant
	}
	items := order.Items
	if stored, err := s.Store.GetOrder(ctx, order.ID); err == nil {
		if len(stored.Items) > 0 {
			items = stored.Items
		}
		order.EventID = stored.EventID
		order.BuyerUserID = stored.BuyerUserID
	} else if len(items) == 0 {
		return err
	}
	expected := 0
	for _, it := range items {
		expected += it.Quantity
	}
	if expected <= 0 || expected > 10000 {
		return ticketdomain.ErrIssuanceInvariant
	}
	if corr == "" {
		corr = logger.CorrelationFrom(ctx)
	}
	id, err := db.NewID()
	if err != nil {
		return err
	}
	claimed, created, err := s.Store.ClaimIssuance(ctx, ticketdomain.IssuanceRun{
		ID: id, OrderID: order.ID, Status: ticketdomain.IssuanceStarted, ExpectedQuantity: expected, CorrelationID: corr, StartedAt: s.Now(),
	})
	if err != nil {
		return err
	}
	if !created && claimed.Status == ticketdomain.IssuanceCompleted {
		n, err := s.Store.CountOrder(ctx, order.ID)
		if err != nil {
			return err
		}
		if n != claimed.ExpectedQuantity {
			return ticketdomain.ErrIssuanceInvariant
		}
		return nil
	}
	for _, it := range items {
		for seq := 1; seq <= it.Quantity; seq++ {
			ok, err := s.Store.HasUnit(ctx, it.ID, seq)
			if err != nil {
				return err
			}
			if ok {
				continue
			}
			if err := s.insertUnit(ctx, order, it, seq); err != nil {
				return err
			}
		}
	}
	n, err := s.Store.CountOrder(ctx, order.ID)
	if err != nil {
		return err
	}
	if n != expected {
		return ticketdomain.ErrIssuanceInvariant
	}
	now := s.Now()
	run := claimed
	run.Status = ticketdomain.IssuanceCompleted
	run.IssuedQuantity = n
	run.CompletedAt = &now
	if err := s.Store.CompleteIssuance(ctx, run); err != nil {
		return err
	}
	_ = s.record(ctx, order.BuyerUserID, "ticket.issued_batch", order.ID, map[string]any{"count": n, "sandbox": true})
	s.emit(ctx, "ticket_issued", order.BuyerUserID, order.ID)
	if s.Notify != nil {
		_ = s.Notify.Enqueue(ctx, notifydomain.Command{
			DomainEventID: "ticket-issued:" + order.ID, RecipientID: order.BuyerUserID,
			Type: notifydomain.TypeTicketIssued, EntityType: "Order", EntityID: order.ID, ActionPath: "/tickets",
		})
	}
	return nil
}

func (s *Service) insertUnit(ctx context.Context, order orderdomain.Order, it orderdomain.Item, seq int) error {
	var last error
	for attempt := 0; attempt < 5; attempt++ {
		tid, err := db.NewID()
		if err != nil {
			return err
		}
		token, err := ticketdomain.NewToken()
		if err != nil {
			return err
		}
		manual, err := ticketdomain.NewManualCode()
		if err != nil {
			return err
		}
		ct, nonce, tag, ver, err := s.Crypto.Encrypt(tid, token)
		if err != nil {
			return err
		}
		now := s.Now()
		holder := ticketdomain.Ticket{}
		if seq >= 1 && seq <= len(it.Attendees) {
			a := it.Attendees[seq-1]
			holder.HolderFullName = a.FullName
			holder.HolderEmail = a.Email
			holder.HolderPhone = a.Phone
			holder.HolderIdentityNumber = a.IdentityNumber
		}
		t := ticketdomain.Ticket{
			ID: tid, TicketNumber: ticketdomain.TicketNumber(tid), ManualCode: manual,
			OrderID: order.ID, OrderItemID: it.ID, EventID: order.EventID, TicketTypeID: it.TicketTypeID,
			TicketTypeName: it.TicketTypeName, SectionName: it.SectionName, SeatLabel: it.SeatLabel, EventSeatID: it.EventSeatID,
			OwnerUserID: order.BuyerUserID, HolderFullName: holder.HolderFullName, HolderEmail: holder.HolderEmail,
			HolderPhone: holder.HolderPhone, HolderIdentityNumber: holder.HolderIdentityNumber,
			UnitSequence: seq, Status: ticketdomain.StatusUnused,
			TokenHash: s.Crypto.Hash(token), TokenCiphertext: ct, TokenNonce: nonce, TokenAuthTag: tag, TokenKeyVersion: ver,
			IssuedAt: now, CreatedAt: now, UpdatedAt: now, Version: 1,
		}
		err = s.Store.InsertTicket(ctx, t)
		if err == nil {
			return nil
		}
		last = err
		if err != ticketdomain.ErrTokenCollision {
			return err
		}
	}
	if last == nil {
		last = ticketdomain.ErrTokenCollision
	}
	return last
}

func (s *Service) CancelUnusedForEvent(ctx context.Context, eventID string) error {
	n, err := s.Store.CancelUnused(ctx, "", eventID, string(ticketdomain.CancelEvent), eventID, s.Now())
	if err != nil {
		return err
	}
	if n > 0 {
		_ = s.record(ctx, "system", "ticket.cancelled_batch", eventID, map[string]any{"count": n, "source": "EVENT_CANCELLED"})
	}
	return nil
}

func (s *Service) CancelUnusedForRefund(ctx context.Context, orderID, refundID string) error {
	n, err := s.Store.CancelUnused(ctx, orderID, "", string(ticketdomain.CancelRefund), refundID, s.Now())
	if err != nil {
		return err
	}
	if n > 0 {
		_ = s.record(ctx, "system", "ticket.cancelled_batch", orderID, map[string]any{"count": n, "source": "REFUND_COMPLETED"})
	}
	return nil
}

func (s *Service) Reconcile(ctx context.Context, batch int) (map[string]any, error) {
	if batch < 1 || batch > 100 {
		batch = 20
	}
	orders, err := s.Store.ListPaidIncomplete(ctx, batch)
	if err != nil {
		return nil, err
	}
	repaired, failed := 0, 0
	for _, o := range orders {
		err := s.inTx(ctx, func(ctx context.Context) error {
			return s.IssueForPaidOrder(ctx, o, "reconcile")
		})
		if err != nil {
			failed++
			continue
		}
		repaired++
	}
	return map[string]any{"scanned": len(orders), "repaired": repaired, "failed": failed, "hasMore": len(orders) == batch}, nil
}

type ListItem struct {
	ID           string         `json:"id"`
	TicketNumber string         `json:"ticketNumber"`
	Status       string         `json:"status"`
	Event        map[string]any `json:"event"`
	TicketType   map[string]any `json:"ticketType"`
	IssuedAt     string         `json:"issuedAt"`
	Holder       map[string]any `json:"holder,omitempty"`
}

func (s *Service) List(ctx context.Context, actor authdomain.User, status, cursor string, limit int) ([]ListItem, string, error) {
	if err := requireBuyer(actor); err != nil {
		return nil, "", err
	}
	if status != "" && status != string(ticketdomain.StatusUnused) && status != string(ticketdomain.StatusUsed) && status != string(ticketdomain.StatusCancelled) {
		return nil, "", ticketdomain.ErrNotFound
	}
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	var cursorAt *time.Time
	cursorID := ""
	if cursor != "" {
		t, id, err := decodeCursor(cursor)
		if err != nil {
			return nil, "", ticketdomain.ErrNotFound
		}
		cursorAt, cursorID = &t, id
	}
	rows, err := s.Store.ListOwner(ctx, actor.ID, status, limit+1, cursorAt, cursorID)
	if err != nil {
		return nil, "", err
	}
	next := ""
	if len(rows) > limit {
		last := rows[limit-1]
		next = encodeCursor(last.IssuedAt, last.ID)
		rows = rows[:limit]
	}
	items := make([]ListItem, 0, len(rows))
	for _, t := range rows {
		ev, _ := s.Store.GetEvent(ctx, t.EventID)
		items = append(items, ListItem{
			ID: t.ID, TicketNumber: t.TicketNumber, Status: string(t.Status),
			Event:      map[string]any{"slug": ev.Slug, "title": ev.Title, "startsAt": ev.StartsAt.UTC().Format(time.RFC3339), "timezone": ev.Timezone, "venueName": ev.VenueName, "city": ev.City},
			TicketType: map[string]any{"name": t.TicketTypeName},
			IssuedAt:   t.IssuedAt.UTC().Format(time.RFC3339Nano),
			Holder:     map[string]any{"fullName": t.HolderFullName},
		})
	}
	return items, next, nil
}

func (s *Service) Get(ctx context.Context, actor authdomain.User, id string) (map[string]any, error) {
	if err := requireBuyer(actor); err != nil {
		return nil, err
	}
	t, err := s.ownerTicket(ctx, actor.ID, id)
	if err != nil {
		return nil, err
	}
	ev, _ := s.Store.GetEvent(ctx, t.EventID)
	o, _ := s.Store.GetOrder(ctx, t.OrderID)
	name, _ := s.Store.GetUserName(ctx, t.OwnerUserID)
	out := map[string]any{
		"id": t.ID, "ticketNumber": t.TicketNumber, "manualCode": ticketdomain.FormatManual(t.ManualCode),
		"status": t.Status, "issuedAt": t.IssuedAt.UTC().Format(time.RFC3339Nano),
		"event": map[string]any{
			"slug": ev.Slug, "title": ev.Title, "startsAt": ev.StartsAt.UTC().Format(time.RFC3339),
			"endsAt": ev.EndsAt.UTC().Format(time.RFC3339), "timezone": ev.Timezone, "venueName": ev.VenueName,
			"addressLine": ev.AddressLine, "city": ev.City, "province": ev.Province,
		},
		"ticketType": map[string]any{"name": t.TicketTypeName, "sectionName": t.SectionName, "seatLabel": t.SeatLabel},
		"order": map[string]any{"orderNumber": o.OrderNumber},
		"owner": map[string]any{"name": name},
		"holder": map[string]any{
			"fullName": t.HolderFullName, "email": t.HolderEmail, "phone": t.HolderPhone, "identityNumber": t.HolderIdentityNumber,
		},
	}
	if t.UsedAt != nil {
		out["usedAt"] = t.UsedAt.UTC().Format(time.RFC3339Nano)
	}
	if t.CancelledAt != nil {
		out["cancelledAt"] = t.CancelledAt.UTC().Format(time.RFC3339Nano)
	}
	s.emit(ctx, "ticket_viewed", actor.ID, t.ID)
	return out, nil
}

func (s *Service) RenderQR(ctx context.Context, actor authdomain.User, id, ip string) ([]byte, error) {
	if err := requireBuyer(actor); err != nil {
		return nil, err
	}
	if err := s.limit(ctx, actor.ID, ip); err != nil {
		return nil, err
	}
	t, err := s.ownerTicket(ctx, actor.ID, id)
	if err != nil {
		return nil, err
	}
	if t.Status != ticketdomain.StatusUnused {
		return nil, ticketdomain.ErrQRUnavailable
	}
	token, err := s.Crypto.Decrypt(t.ID, t.TokenKeyVersion, t.TokenCiphertext, t.TokenNonce, t.TokenAuthTag)
	if err != nil {
		return nil, err
	}
	if s.Crypto.Hash(token) != t.TokenHash {
		return nil, ticketdomain.ErrCryptoFailed
	}
	if s.QR == nil {
		return nil, ticketdomain.ErrCryptoFailed
	}
	return s.QR.PNG(token, 320)
}

func (s *Service) ownerTicket(ctx context.Context, ownerID, id string) (ticketdomain.Ticket, error) {
	t, err := s.Store.Get(ctx, id)
	if err != nil || t.OwnerUserID != ownerID {
		return ticketdomain.Ticket{}, ticketdomain.ErrNotFound
	}
	return t, nil
}

func requireBuyer(actor authdomain.User) error {
	if !actor.IsActive() || actor.Role == authdomain.RoleAdmin {
		return ticketdomain.ErrAccessDenied
	}
	return nil
}

func (s *Service) inTx(ctx context.Context, fn func(context.Context) error) error {
	if s.UoW == nil {
		return fn(ctx)
	}
	return s.UoW(ctx, fn)
}

func (s *Service) limit(ctx context.Context, userID, ip string) error {
	if s.Rates == nil || s.HashKey == nil {
		return nil
	}
	n, err := s.Rates.Hit(ctx, s.HashKey(authapp.HashRateKey("ticket-qr", ip, userID)), "ticket-qr", time.Minute)
	if err != nil {
		return err
	}
	if n > 30 {
		return ticketdomain.ErrRateLimited
	}
	return nil
}

func (s *Service) record(ctx context.Context, actorID, action, entityID string, after map[string]any) error {
	if s.Audit == nil {
		return nil
	}
	entity := entityID
	rec := auditdomain.Record{
		ActorType: auditdomain.ActorUser, Action: action, EntityType: "Ticket", EntityID: &entity,
		Outcome: auditdomain.OutcomeSuccess, After: after, Metadata: map[string]any{"source": "api"},
		CorrelationID: logger.CorrelationFrom(ctx),
	}
	if actorID == "" || actorID == "system" {
		rec.ActorType = auditdomain.ActorSystem
	} else {
		rec.ActorUserID = &actorID
	}
	return s.Audit.Record(ctx, rec)
}

func (s *Service) emit(ctx context.Context, name, actorID, entityID string) {
	if s.Analytics == nil {
		return
	}
	_ = s.Analytics.Emit(ctx, analyticsapp.Input{
		Name: name, ActorUserID: actorID, EntityType: "Ticket", EntityID: entityID,
		Properties:       map[string]any{"source": "api", "entityType": "Ticket", "entityId": entityID},
		DeduplicationKey: name + ":" + entityID,
	})
}

func encodeCursor(t time.Time, id string) string {
	return hex.EncodeToString([]byte(fmt.Sprintf("%s|%s", t.UTC().Format(time.RFC3339Nano), id)))
}

func decodeCursor(raw string) (time.Time, string, error) {
	b, err := hex.DecodeString(raw)
	if err != nil {
		return time.Time{}, "", err
	}
	parts := strings.SplitN(string(b), "|", 2)
	if len(parts) != 2 {
		return time.Time{}, "", ticketdomain.ErrNotFound
	}
	tm, err := time.Parse(time.RFC3339Nano, parts[0])
	return tm, parts[1], err
}
