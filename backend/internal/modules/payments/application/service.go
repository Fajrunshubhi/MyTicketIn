package application

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	auditdomain "myticketin/internal/modules/audit/domain"
	authapp "myticketin/internal/modules/auth/application"
	authdomain "myticketin/internal/modules/auth/domain"
	notifydomain "myticketin/internal/modules/notifications/domain"
	orderapp "myticketin/internal/modules/orders/application"
	orderdomain "myticketin/internal/modules/orders/domain"
	"myticketin/internal/modules/payments/domain"
	"myticketin/internal/platform/db"
	"myticketin/internal/platform/logger"
)

type Store interface {
	Insert(ctx context.Context, p domain.Payment) error
	Update(ctx context.Context, p domain.Payment) error
	Get(ctx context.Context, id string) (domain.Payment, error)
	GetByOrder(ctx context.Context, orderID string) (domain.Payment, error)
	GetByExternal(ctx context.Context, provider, ref string) (domain.Payment, error)
	GetForUpdate(ctx context.Context, id string) (domain.Payment, error)
	GetByExternalForUpdate(ctx context.Context, provider, ref string) (domain.Payment, error)
	InsertInbox(ctx context.Context, ev domain.WebhookEvent) (domain.WebhookEvent, bool, error)
	GetInboxForUpdate(ctx context.Context, provider, eventID string) (domain.WebhookEvent, error)
	MarkInbox(ctx context.Context, ev domain.WebhookEvent) error
	InsertRecon(ctx context.Context, rec domain.Reconciliation) error
	ListRecon(ctx context.Context, status string, limit int, cursorAt *time.Time, cursorID string) ([]domain.Reconciliation, error)
	GetReconForUpdate(ctx context.Context, id string) (domain.Reconciliation, error)
	UpdateRecon(ctx context.Context, rec domain.Reconciliation) error
	InsertRefund(ctx context.Context, r domain.Refund) error
	GetRefund(ctx context.Context, id string) (domain.Refund, error)
	GetRefundForUpdate(ctx context.Context, id string) (domain.Refund, error)
	GetRefundByExternal(ctx context.Context, paymentID, ref string) (domain.Refund, error)
	UpdateRefund(ctx context.Context, r domain.Refund) error
	SumRefunds(ctx context.Context, paymentID string, includeRequested bool) (int64, error)
	SumCompleted(ctx context.Context, orderID string) (int64, error)
	ClaimIdempotency(ctx context.Context, rec orderdomain.Idempotency) (orderdomain.Idempotency, bool, error)
	CompleteIdempotency(ctx context.Context, actor, scope, keyHash string, httpStatus int, resourceID string, body []byte) error
}

type Auditor interface {
	Record(ctx context.Context, rec auditdomain.Record) error
}

type Limiter interface {
	Hit(ctx context.Context, keyHash, scope string, window time.Duration) (int, error)
}

type Service struct {
	Store    Store
	Orders   *orderapp.Service
	Gateway  domain.Gateway
	Guard    domain.FulfillmentGuard
	Audit    Auditor
	Rates    Limiter
	HashKey  func(raw string) string
	UoW      func(ctx context.Context, fn func(context.Context) error) error
	Now      func() time.Time
	AppEnv   string
	AllowDev bool
	Notify   interface {
		Enqueue(ctx context.Context, cmd notifydomain.Command) error
	}
}

func NewService(store Store, orders *orderapp.Service, gw domain.Gateway) *Service {
	return &Service{
		Store: store, Orders: orders, Gateway: gw, Guard: domain.AllowAllGuard{},
		Now: func() time.Time { return time.Now().UTC() },
	}
}

type PaymentView struct {
	ID                string         `json:"id"`
	Status            domain.Status  `json:"status"`
	Method            domain.Method  `json:"method"`
	AmountRupiah      int64          `json:"amountRupiah"`
	Currency          string         `json:"currency"`
	Instructions      map[string]any `json:"instructions"`
	ExpiresAt         string         `json:"expiresAt,omitempty"`
	ProviderExpiresAt string         `json:"providerExpiresAt,omitempty"`
	Sandbox           bool           `json:"sandbox"`
	OrderStatus       string         `json:"orderStatus,omitempty"`
	ServerTime        string         `json:"serverTime,omitempty"`
	Loyalty           map[string]any `json:"loyalty,omitempty"`
}

type WebhookResult struct {
	HTTP     int
	Received bool
	Replay   bool
	Err      error
}

func (s *Service) Create(ctx context.Context, actor authdomain.User, orderID, methodRaw, idemKey, ip string) (PaymentView, bool, error) {
	if err := s.requireBuyer(actor); err != nil {
		return PaymentView{}, false, err
	}
	if err := s.limit(ctx, "create-payment", actor.ID+":"+orderID, ip, 5, time.Minute); err != nil {
		return PaymentView{}, false, err
	}
	if err := orderdomain.ValidateIdempotencyKey(idemKey); err != nil {
		return PaymentView{}, false, domain.ErrKeyRequired
	}
	method, err := domain.ParseMethod(methodRaw)
	if err != nil {
		return PaymentView{}, false, err
	}
	o, err := s.Orders.Store.GetOrder(ctx, orderID)
	if err != nil {
		return PaymentView{}, false, domain.ErrNotFound
	}
	if o.BuyerUserID != actor.ID {
		return PaymentView{}, false, domain.ErrNotFound
	}
	if o.Status != orderdomain.StatusPending || !s.Now().Before(o.ExpiresAt) {
		return PaymentView{}, false, domain.ErrNotAllowed
	}
	var existingPay *domain.Payment
	if existing, err := s.Store.GetByOrder(ctx, orderID); err == nil {
		if existing.ExternalReference != nil && existing.Status != domain.StatusCreated {
			return s.view(existing, o, s.Now()), true, nil
		}
		existingPay = &existing
	}
	reqHash := sha256Hex(orderID + "|" + string(method))
	keyHash := sha256Hex(idemKey)
	var out domain.Payment
	err = s.retryTx(ctx, func(ctx context.Context) error {
		now := s.Now()
		claimID, err := db.NewID()
		if err != nil {
			return err
		}
		claimed, created, err := s.Store.ClaimIdempotency(ctx, orderdomain.Idempotency{
			ID: claimID, ActorUserID: actor.ID, Scope: "CREATE_PAYMENT", KeyHash: keyHash, RequestHash: reqHash,
			Status: orderdomain.IdempotencyProc, ExpiresAt: now.Add(orderdomain.IdempotencyTTL),
		})
		if err != nil {
			return err
		}
		if !created {
			if claimed.RequestHash != reqHash {
				return domain.ErrKeyReused
			}
			if claimed.Status == orderdomain.IdempotencyProc {
				return domain.ErrKeyInProgress
			}
			if claimed.ResourceID != nil {
				p, err := s.Store.Get(ctx, *claimed.ResourceID)
				if err != nil {
					return err
				}
				out = p
				return nil
			}
		}
		if existingPay != nil {
			out = *existingPay
			return nil
		}
		id, err := db.NewID()
		if err != nil {
			return err
		}
		p := domain.Payment{
			ID: id, OrderID: orderID, Provider: domain.ProviderSandbox, Environment: "SANDBOX",
			ProviderIdempotencyKey: "pay:" + orderID, Method: method, AmountRupiah: o.TotalPayableRupiah,
			Currency: "IDR", Status: domain.StatusCreated, InstructionData: map[string]any{"sandbox": true},
			CreatedAt: now, UpdatedAt: now, Version: 1,
		}
		if err := s.Store.Insert(ctx, p); err != nil {
			if existing, e2 := s.Store.GetByOrder(ctx, orderID); e2 == nil {
				out = existing
				return nil
			}
			return err
		}
		out = p
		return s.Store.CompleteIdempotency(ctx, actor.ID, "CREATE_PAYMENT", keyHash, 201, p.ID, domain.MustJSON(map[string]any{"id": p.ID}))
	})
	if err != nil {
		return PaymentView{}, false, err
	}
	if out.Status == domain.StatusPending || out.ExternalReference != nil {
		return s.view(out, o, s.Now()), true, nil
	}
	res, err := s.Gateway.CreatePayment(o.OrderNumber, o.TotalPayableRupiah, method, o.ExpiresAt, out.ProviderIdempotencyKey)
	if err != nil {
		return PaymentView{}, false, domain.ErrProviderUnavailable
	}
	out.ExternalReference = strPtr(res.ExternalReference)
	out.Status = domain.StatusPending
	out.InstructionData = res.Instructions
	out.ProviderExpiresAt = res.ProviderExpiresAt
	out.UpdatedAt = s.Now()
	if err := s.Store.Update(ctx, out); err != nil {
		return PaymentView{}, false, err
	}
	_ = s.record(ctx, actor.ID, "payment.created", out.ID, nil, map[string]any{"status": "PENDING", "sandbox": true})
	return s.view(out, o, s.Now()), false, nil
}

func (s *Service) Get(ctx context.Context, actor authdomain.User, orderID string) (PaymentView, error) {
	o, err := s.Orders.Store.GetOrder(ctx, orderID)
	if err != nil {
		return PaymentView{}, domain.ErrNotFound
	}
	if actor.Role != authdomain.RoleAdmin && o.BuyerUserID != actor.ID {
		return PaymentView{}, domain.ErrNotFound
	}
	p, err := s.Store.GetByOrder(ctx, orderID)
	if err != nil {
		return PaymentView{}, domain.ErrNotFound
	}
	return s.view(p, o, s.Now()), nil
}

func (s *Service) ProcessWebhook(ctx context.Context, provider string, raw []byte, headers map[string]string) WebhookResult {
	if provider != domain.ProviderSandbox {
		return WebhookResult{HTTP: 400, Err: domain.ErrMalformed}
	}
	now := s.Now()
	verified, err := s.Gateway.VerifyWebhook(raw, headers, now)
	if errors.Is(err, domain.ErrMalformed) || errors.Is(err, domain.ErrAmountMismatch) {
		return WebhookResult{HTTP: 400, Err: err}
	}
	if err != nil {
		return WebhookResult{HTTP: 202, Err: err}
	}
	corr := logger.CorrelationFrom(ctx)
	if corr == "" {
		corr = "req_webhook"
	}
	if !verified.Valid {
		_ = s.retryTx(ctx, func(ctx context.Context) error {
			id, err := db.NewID()
			if err != nil {
				return err
			}
			_, _, err = s.Store.InsertInbox(ctx, domain.WebhookEvent{
				ID: id, Provider: provider, ExternalEventID: verified.EventID, PayloadHash: verified.PayloadHash,
				SignatureValid: false, ProcessingStatus: domain.WebhookRejected, ReceivedAt: now, ProcessedAt: &now,
				CorrelationID: corr, SanitizedPayload: map[string]any{"sandbox": true},
			})
			return err
		})
		_ = s.record(ctx, "system", "webhook.rejected", verified.EventID, nil, map[string]any{"reason": "SIGNATURE_INVALID"})
		return WebhookResult{HTTP: 401, Err: domain.ErrSignatureInvalid}
	}
	mapped, isRefund, known := domain.MapEvent(verified.EventType)
	var httpStatus int
	replay := false
	err = s.retryTx(ctx, func(ctx context.Context) error {
		httpStatus = 200
		id, err := db.NewID()
		if err != nil {
			return err
		}
		ref := verified.ExternalReference
		ev, inserted, err := s.Store.InsertInbox(ctx, domain.WebhookEvent{
			ID: id, Provider: provider, ExternalEventID: verified.EventID, ExternalReference: strPtr(ref),
			PayloadHash: verified.PayloadHash, SignatureValid: true, ProcessingStatus: domain.WebhookReceived,
			ReceivedAt: now, CorrelationID: corr, SanitizedPayload: verified.SafePayload,
		})
		if err != nil {
			return err
		}
		if !inserted {
			cur, err := s.Store.GetInboxForUpdate(ctx, provider, verified.EventID)
			if err != nil {
				return err
			}
			if cur.PayloadHash != verified.PayloadHash {
				return domain.ErrEventCollision
			}
			if cur.ProcessingStatus == domain.WebhookProcessed || cur.ProcessingStatus == domain.WebhookRejected {
				replay = true
				httpStatus = 200
				return nil
			}
			ev = cur
		} else {
			locked, err := s.Store.GetInboxForUpdate(ctx, provider, verified.EventID)
			if err != nil {
				return err
			}
			ev = locked
		}
		if !known {
			ev.ProcessingStatus = domain.WebhookProcessed
			ev.ProcessedAt = &now
			reason := "UNKNOWN_EVENT"
			ev.ReasonCode = &reason
			return s.Store.MarkInbox(ctx, ev)
		}
		if isRefund {
			return s.applyRefundEvent(ctx, ev, verified, now, corr)
		}
		p, err := s.Store.GetByExternalForUpdate(ctx, provider, verified.ExternalReference)
		if err != nil {
			httpStatus = 202
			return err
		}
		o, err := s.Orders.Store.GetOrderForUpdate(ctx, p.OrderID)
		if err != nil {
			return err
		}
		if verified.AmountRupiah != 0 && verified.AmountRupiah != p.AmountRupiah {
			if err := s.openRecon(ctx, p, o, ev, "AMOUNT_MISMATCH", verified.AmountRupiah, now); err != nil {
				return err
			}
			st := mapped
			ev.MappedStatus = &st
			ev.ProcessingStatus = domain.WebhookProcessed
			ev.ProcessedAt = &now
			return s.Store.MarkInbox(ctx, ev)
		}
		switch mapped {
		case domain.StatusSucceeded:
			if err := s.applySuccess(ctx, p, o, ev, now, corr); err != nil {
				if retryable(err) {
					httpStatus = 202
				}
				return err
			}
			_ = s.notify(ctx, o.BuyerUserID, "payment-ok:"+p.ID, notifydomain.TypePaymentSucceeded, "Order", o.ID, "/orders/"+o.ID)
		case domain.StatusFailed:
			if err := s.Orders.FailIfPendingInTx(ctx, o.ID, now, false); err != nil {
				return err
			}
			if err := s.markPayment(ctx, p, domain.StatusFailed, now); err != nil {
				return err
			}
			_ = s.notify(ctx, o.BuyerUserID, "payment-fail:"+p.ID, notifydomain.TypePaymentFailed, "Order", o.ID, "/orders/"+o.ID)
		case domain.StatusExpired:
			if err := s.Orders.FailIfPendingInTx(ctx, o.ID, now, true); err != nil {
				return err
			}
			if err := s.markPayment(ctx, p, domain.StatusExpired, now); err != nil {
				return err
			}
		}
		st := mapped
		ev.MappedStatus = &st
		ev.ProcessingStatus = domain.WebhookProcessed
		ev.ProcessedAt = &now
		return s.Store.MarkInbox(ctx, ev)
	})
	if errors.Is(err, domain.ErrEventCollision) {
		return WebhookResult{HTTP: 409, Err: err}
	}
	if err != nil {
		if httpStatus == 0 {
			httpStatus = 202
		}
		return WebhookResult{HTTP: httpStatus, Err: err, Replay: replay}
	}
	return WebhookResult{HTTP: httpStatus, Received: true, Replay: replay}
}

func (s *Service) applySuccess(ctx context.Context, p domain.Payment, o orderdomain.Order, ev domain.WebhookEvent, now time.Time, corr string) error {
	if p.Status == domain.StatusSucceeded || p.Status == domain.StatusRefunded {
		return nil
	}
	onTime := o.Status == orderdomain.StatusPending && now.Before(o.ExpiresAt)
	if onTime {
		if _, err := s.Orders.ConvertToPaidInTx(ctx, o.ID, now, corr); err != nil {
			if errors.Is(err, orderdomain.ErrExpired) || errors.Is(err, orderdomain.ErrConflict) {
				onTime = false
			} else {
				return err
			}
		}
	}
	if !onTime {
		if o.Status == orderdomain.StatusPending {
			if err := s.Orders.ExpireIfPendingInTx(ctx, o.ID, now); err != nil {
				return err
			}
		}
		reason := "LATE_SUCCESS"
		if o.Status != orderdomain.StatusPending && o.Status != orderdomain.StatusExpired {
			reason = "ORDER_STATE_MISMATCH"
		}
		if err := s.openRecon(ctx, p, o, ev, reason, p.AmountRupiah, now); err != nil {
			return err
		}
	}
	return s.markPayment(ctx, p, domain.StatusSucceeded, now)
}

func (s *Service) applyRefundEvent(ctx context.Context, ev domain.WebhookEvent, verified domain.VerifiedWebhook, now time.Time, corr string) error {
	rf, err := s.findRefund(ctx, verified.ExternalReference)
	if err != nil {
		return err
	}
	rf, err = s.Store.GetRefundForUpdate(ctx, rf.ID)
	if err != nil {
		return err
	}
	pay, err := s.Store.GetForUpdate(ctx, rf.PaymentID)
	if err != nil {
		return err
	}
	if rf.LoyaltyProcessedAt != nil {
		ev.ProcessingStatus = domain.WebhookProcessed
		ev.ProcessedAt = &now
		st := domain.StatusRefunded
		ev.MappedStatus = &st
		return s.Store.MarkInbox(ctx, ev)
	}
	if s.Guard != nil {
		if err := s.Guard.CanRefund(rf.OrderID); err != nil {
			return domain.ErrFulfillmentBlocked
		}
	}
	rf.Status = domain.RefundCompleted
	rf.CompletedAt = &now
	rf.LoyaltyProcessedAt = &now
	rf.ProviderEventID = strPtr(verified.EventID)
	if err := s.Store.UpdateRefund(ctx, rf); err != nil {
		return err
	}
	cum, err := s.Store.SumCompleted(ctx, rf.OrderID)
	if err != nil {
		return err
	}
	_, _, full, err := s.Orders.ApplyCompletedRefundInTx(ctx, rf.OrderID, rf.ID, cum, now, corr)
	if err != nil {
		return err
	}
	if full {
		if err := s.markPayment(ctx, pay, domain.StatusRefunded, now); err != nil {
			return err
		}
	}
	if o, err := s.Orders.Store.GetOrder(ctx, rf.OrderID); err == nil {
		_ = s.notify(ctx, o.BuyerUserID, "refund:"+rf.ID, notifydomain.TypeRefundUpdated, "Refund", rf.ID, "/orders/"+rf.OrderID)
	}
	ev.ProcessingStatus = domain.WebhookProcessed
	ev.ProcessedAt = &now
	st := domain.StatusRefunded
	ev.MappedStatus = &st
	return s.Store.MarkInbox(ctx, ev)
}

func (s *Service) notify(ctx context.Context, userID, evt string, typ notifydomain.Type, entityType, entityID, path string) error {
	if s.Notify == nil || userID == "" {
		return nil
	}
	return s.Notify.Enqueue(ctx, notifydomain.Command{
		DomainEventID: evt, RecipientID: userID, Type: typ, EntityType: entityType, EntityID: entityID, ActionPath: path,
	})
}

func (s *Service) findRefund(ctx context.Context, ref string) (domain.Refund, error) {
	// Lookup via payment-scoped unique: scan by walking GetRefundByExternal needs payment id.
	// Store method GetRefundByExternal with empty payment uses ref globally in memory/postgres.
	return s.Store.GetRefundByExternal(ctx, "", ref)
}

func (s *Service) RequestRefund(ctx context.Context, actor authdomain.User, orderID string, amount int64, reason, idemKey, ip string) (domain.Refund, bool, error) {
	if err := s.requireAdmin(actor); err != nil {
		return domain.Refund{}, false, err
	}
	if err := s.limit(ctx, "create-payment", actor.ID, ip, 20, time.Minute); err != nil {
		return domain.Refund{}, false, err
	}
	if err := orderdomain.ValidateIdempotencyKey(idemKey); err != nil {
		return domain.Refund{}, false, domain.ErrKeyRequired
	}
	reason = strings.TrimSpace(reason)
	if utf8.RuneCountInString(reason) < 10 || utf8.RuneCountInString(reason) > 1000 {
		return domain.Refund{}, false, domain.ErrRefundNotAllowed
	}
	if amount <= 0 {
		return domain.Refund{}, false, domain.ErrRefundAmount
	}
	var out domain.Refund
	err := s.retryTx(ctx, func(ctx context.Context) error {
		o, err := s.Orders.Store.GetOrderForUpdate(ctx, orderID)
		if err != nil {
			return domain.ErrNotFound
		}
		if o.Status != orderdomain.StatusPaid {
			return domain.ErrRefundNotAllowed
		}
		p, err := s.Store.GetByOrder(ctx, orderID)
		if err != nil || p.Status != domain.StatusSucceeded {
			return domain.ErrRefundNotAllowed
		}
		p, err = s.Store.GetForUpdate(ctx, p.ID)
		if err != nil {
			return err
		}
		if s.Guard != nil {
			if err := s.Guard.CanRefund(orderID); err != nil {
				return domain.ErrFulfillmentBlocked
			}
		}
		used, err := s.Store.SumRefunds(ctx, p.ID, true)
		if err != nil {
			return err
		}
		if used+amount > p.AmountRupiah {
			return domain.ErrRefundAmount
		}
		keyHash := sha256Hex(idemKey)
		reqHash := sha256Hex(fmt.Sprintf("%s|%d|%s", orderID, amount, reason))
		claimID, err := db.NewID()
		if err != nil {
			return err
		}
		claimed, created, err := s.Store.ClaimIdempotency(ctx, orderdomain.Idempotency{
			ID: claimID, ActorUserID: actor.ID, Scope: "CREATE_REFUND", KeyHash: keyHash, RequestHash: reqHash,
			Status: orderdomain.IdempotencyProc, ExpiresAt: s.Now().Add(orderdomain.IdempotencyTTL),
		})
		if err != nil {
			return err
		}
		if !created {
			if claimed.RequestHash != reqHash {
				return domain.ErrKeyReused
			}
			if claimed.ResourceID != nil {
				out, err = s.Store.GetRefund(ctx, *claimed.ResourceID)
				return err
			}
		}
		id, err := db.NewID()
		if err != nil {
			return err
		}
		now := s.Now()
		out = domain.Refund{
			ID: id, RefundNumber: refundNumber(id), OrderID: orderID, PaymentID: p.ID,
			AmountRupiah: amount, Reason: reason, Status: domain.RefundRequested,
			RequestedByUserID: actor.ID, RequestedAt: now, CreatedAt: now, UpdatedAt: now, Version: 1,
		}
		if err := s.Store.InsertRefund(ctx, out); err != nil {
			return err
		}
		return s.Store.CompleteIdempotency(ctx, actor.ID, "CREATE_REFUND", keyHash, 201, out.ID, domain.MustJSON(map[string]any{"id": out.ID}))
	})
	return out, false, err
}

func (s *Service) DecideRefund(ctx context.Context, actor authdomain.User, id, decision, reason string, expectedVersion int) (domain.Refund, error) {
	if err := s.requireAdmin(actor); err != nil {
		return domain.Refund{}, err
	}
	reason = strings.TrimSpace(reason)
	if utf8.RuneCountInString(reason) < 10 {
		return domain.Refund{}, domain.ErrRefundNotAllowed
	}
	var out domain.Refund
	err := s.retryTx(ctx, func(ctx context.Context) error {
		rf, err := s.Store.GetRefundForUpdate(ctx, id)
		if err != nil {
			return err
		}
		if expectedVersion != 0 && rf.Version != expectedVersion {
			return domain.ErrTransitionInvalid
		}
		if rf.Status != domain.RefundRequested {
			return domain.ErrTransitionInvalid
		}
		now := s.Now()
		rf.DecidedByUserID = strPtr(actor.ID)
		rf.DecisionReason = strPtr(reason)
		rf.DecidedAt = &now
		if strings.EqualFold(decision, "REJECT") {
			rf.Status = domain.RefundRejected
			out = rf
			return s.Store.UpdateRefund(ctx, rf)
		}
		if !strings.EqualFold(decision, "APPROVE") {
			return domain.ErrRefundNotAllowed
		}
		if s.Guard != nil {
			if err := s.Guard.CanRefund(rf.OrderID); err != nil {
				return domain.ErrFulfillmentBlocked
			}
		}
		p, err := s.Store.GetForUpdate(ctx, rf.PaymentID)
		if err != nil {
			return err
		}
		extPay := ""
		if p.ExternalReference != nil {
			extPay = *p.ExternalReference
		}
		ref, st, hash, err := s.Gateway.RefundSandbox(extPay, rf.ID, rf.AmountRupiah, reason)
		if err != nil {
			rf.Status = domain.RefundFailed
			out = rf
			_ = s.Store.UpdateRefund(ctx, rf)
			return domain.ErrRefundProvider
		}
		rf.ExternalReference = strPtr(ref)
		rf.Status = domain.RefundProcessing
		if st == domain.StatusSucceeded {
			rf.Status = domain.RefundProcessing
		}
		_ = hash
		out = rf
		return s.Store.UpdateRefund(ctx, rf)
	})
	return out, err
}

func (s *Service) ListRecon(ctx context.Context, actor authdomain.User, status string, limit int, cursor string) ([]domain.Reconciliation, string, error) {
	if err := s.requireAdmin(actor); err != nil {
		return nil, "", err
	}
	if limit <= 0 || limit > 50 {
		limit = 25
	}
	var cursorAt *time.Time
	cursorID := ""
	if cursor != "" {
		t, id, err := decodeCursor(cursor)
		if err != nil {
			return nil, "", domain.ErrMalformed
		}
		cursorAt, cursorID = &t, id
	}
	rows, err := s.Store.ListRecon(ctx, status, limit+1, cursorAt, cursorID)
	if err != nil {
		return nil, "", err
	}
	next := ""
	if len(rows) > limit {
		last := rows[limit-1]
		next = encodeCursor(last.CreatedAt, last.ID)
		rows = rows[:limit]
	}
	return rows, next, nil
}

func (s *Service) ResolveRecon(ctx context.Context, actor authdomain.User, id, decision, notes string) (domain.Reconciliation, error) {
	if err := s.requireAdmin(actor); err != nil {
		return domain.Reconciliation{}, err
	}
	notes = strings.TrimSpace(notes)
	if utf8.RuneCountInString(notes) < 10 || utf8.RuneCountInString(notes) > 1000 {
		return domain.Reconciliation{}, domain.ErrRefundNotAllowed
	}
	var out domain.Reconciliation
	err := s.retryTx(ctx, func(ctx context.Context) error {
		rec, err := s.Store.GetReconForUpdate(ctx, id)
		if err != nil {
			return err
		}
		if rec.Status != domain.ReconOpen {
			out = rec
			return nil
		}
		now := s.Now()
		rec.Notes = &notes
		rec.ResolvedBy = strPtr(actor.ID)
		rec.ResolvedAt = &now
		if strings.EqualFold(decision, "REJECT") {
			rec.Status = domain.ReconRejected
		} else if strings.EqualFold(decision, "ACCEPT_REFUND_SANDBOX") {
			rec.Status = domain.ReconAccepted
			p, err := s.Store.GetForUpdate(ctx, rec.PaymentID)
			if err != nil {
				return err
			}
			if p.Status == domain.StatusSucceeded && p.ExternalReference != nil {
				rid, err := db.NewID()
				if err != nil {
					return err
				}
				ref, _, _, err := s.Gateway.RefundSandbox(*p.ExternalReference, rid, p.AmountRupiah, notes)
				if err != nil {
					return domain.ErrRefundProvider
				}
				rf := domain.Refund{
					ID: rid, RefundNumber: refundNumber(rid), OrderID: rec.OrderID, PaymentID: p.ID,
					AmountRupiah: p.AmountRupiah, Reason: notes, Status: domain.RefundProcessing,
					RequestedByUserID: actor.ID, DecidedByUserID: strPtr(actor.ID), DecisionReason: &notes,
					ExternalReference: strPtr(ref), RequestedAt: now, DecidedAt: &now, CreatedAt: now, UpdatedAt: now, Version: 1,
				}
				if err := s.Store.InsertRefund(ctx, rf); err != nil {
					return err
				}
			}
		} else {
			return domain.ErrRefundNotAllowed
		}
		out = rec
		return s.Store.UpdateRecon(ctx, rec)
	})
	return out, err
}

func (s *Service) SandboxSettle(ctx context.Context, actor authdomain.User, orderID string) error {
	if !s.AllowDev {
		return domain.ErrNotAllowed
	}
	p, err := s.Get(ctx, actor, orderID)
	if err != nil {
		return err
	}
	pay, err := s.Store.Get(ctx, p.ID)
	if err != nil || pay.ExternalReference == nil {
		return domain.ErrNotAllowed
	}
	body := domain.MustJSON(map[string]any{
		"eventId": "sim_" + pay.ID, "eventType": domain.EventPaymentSucceeded,
		"externalReference": *pay.ExternalReference, "amountRupiah": pay.AmountRupiah, "currency": "IDR",
	})
	secret := ""
	if hs, ok := s.Gateway.(interface{ SecretValue() string }); ok {
		secret = hs.SecretValue()
	}
	sig := domain.SignBody(secret, body)
	res := s.ProcessWebhook(ctx, domain.ProviderSandbox, body, map[string]string{"X-Sandbox-Signature": sig})
	if res.Err != nil && res.HTTP >= 400 {
		return res.Err
	}
	return nil
}

func (s *Service) view(p domain.Payment, o orderdomain.Order, now time.Time) PaymentView {
	v := PaymentView{
		ID: p.ID, Status: p.Status, Method: p.Method, AmountRupiah: p.AmountRupiah, Currency: "IDR",
		Instructions: p.InstructionData, Sandbox: true, OrderStatus: string(o.Status),
		ServerTime: now.UTC().Format(time.RFC3339Nano),
		Loyalty: map[string]any{
			"redeemedPoints": o.RedeemedPoints, "earnOnPaidPoints": o.TotalPayableRupiah / 1000,
			"estimated": o.Status == orderdomain.StatusPending, "cashValue": false, "sandbox": true,
		},
	}
	if p.ProviderExpiresAt != nil {
		v.ProviderExpiresAt = p.ProviderExpiresAt.UTC().Format(time.RFC3339)
		v.ExpiresAt = v.ProviderExpiresAt
	} else {
		v.ExpiresAt = o.ExpiresAt.UTC().Format(time.RFC3339)
	}
	return v
}

func (s *Service) markPayment(ctx context.Context, p domain.Payment, st domain.Status, now time.Time) error {
	switch st {
	case domain.StatusSucceeded:
		p.Status = domain.StatusSucceeded
		p.SucceededAt = &now
	case domain.StatusFailed:
		p.Status = domain.StatusFailed
		p.FailedAt = &now
	case domain.StatusExpired:
		p.Status = domain.StatusExpired
		p.FailedAt = &now
	case domain.StatusRefunded:
		p.Status = domain.StatusRefunded
		if p.SucceededAt == nil {
			p.SucceededAt = &now
		}
		p.RefundedAt = &now
	}
	p.UpdatedAt = now
	return s.Store.Update(ctx, p)
}

func (s *Service) openRecon(ctx context.Context, p domain.Payment, o orderdomain.Order, ev domain.WebhookEvent, reason string, amount int64, now time.Time) error {
	id, err := db.NewID()
	if err != nil {
		return err
	}
	return s.Store.InsertRecon(ctx, domain.Reconciliation{
		ID: id, PaymentID: p.ID, OrderID: o.ID, WebhookEventID: ev.ID, ReasonCode: reason,
		Status: domain.ReconOpen, ProviderAmount: &amount, CreatedAt: now, UpdatedAt: now, OrderNumber: o.OrderNumber,
	})
}

func (s *Service) requireBuyer(actor authdomain.User) error {
	if !actor.IsActive() || actor.Role == authdomain.RoleAdmin {
		return domain.ErrNotAllowed
	}
	return nil
}

func (s *Service) requireAdmin(actor authdomain.User) error {
	if !actor.IsActive() || actor.Role != authdomain.RoleAdmin {
		return authdomain.ErrForbidden
	}
	return nil
}

func (s *Service) retryTx(ctx context.Context, fn func(context.Context) error) error {
	if s.UoW == nil {
		return fn(ctx)
	}
	var err error
	for i := 0; i < 3; i++ {
		err = s.UoW(ctx, fn)
		if err == nil || !retryable(err) {
			return err
		}
		time.Sleep(time.Duration(10*(i+1)) * time.Millisecond)
	}
	return err
}

func retryable(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "40001") || strings.Contains(msg, "40P01") || strings.Contains(msg, "could not serialize")
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

func (s *Service) record(ctx context.Context, actorID, action, entityID string, before, after map[string]any) error {
	if s.Audit == nil {
		return nil
	}
	entity := entityID
	rec := auditdomain.Record{
		ActorType: auditdomain.ActorUser, Action: action,
		EntityType: "Payment", EntityID: &entity, Outcome: auditdomain.OutcomeSuccess,
		Before: before, After: after, Metadata: map[string]any{"source": "api", "sandbox": true},
		CorrelationID: logger.CorrelationFrom(ctx),
	}
	if actorID == "" || actorID == "system" {
		rec.ActorType = auditdomain.ActorSystem
	} else {
		rec.ActorUserID = &actorID
	}
	return s.Audit.Record(ctx, rec)
}

func strPtr(s string) *string { return &s }

func sha256Hex(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func refundNumber(id string) string {
	clean := strings.ToUpper(strings.ReplaceAll(id, "-", ""))
	if len(clean) > 12 {
		clean = clean[:12]
	}
	return "RFND-" + clean
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
		return time.Time{}, "", errors.New("cursor")
	}
	t, err := time.Parse(time.RFC3339Nano, parts[0])
	return t, parts[1], err
}
