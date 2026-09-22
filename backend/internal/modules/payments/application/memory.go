package application

import (
	"context"
	"sort"
	"sync"
	"time"

	orderdomain "myticketin/internal/modules/orders/domain"
	"myticketin/internal/modules/payments/domain"
)

type Memory struct {
	mu      sync.Mutex
	byID    map[string]domain.Payment
	byOrder map[string]string
	byExt   map[string]string
	inbox   map[string]domain.WebhookEvent
	recon   map[string]domain.Reconciliation
	refunds map[string]domain.Refund
	idem    map[string]orderdomain.Idempotency
}

func NewMemory() *Memory {
	return &Memory{
		byID: map[string]domain.Payment{}, byOrder: map[string]string{}, byExt: map[string]string{},
		inbox: map[string]domain.WebhookEvent{}, recon: map[string]domain.Reconciliation{},
		refunds: map[string]domain.Refund{}, idem: map[string]orderdomain.Idempotency{},
	}
}

func inboxKey(provider, eventID string) string { return provider + "|" + eventID }

func (m *Memory) Insert(_ context.Context, p domain.Payment) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.byOrder[p.OrderID]; ok {
		return domain.ErrTransitionInvalid
	}
	m.byID[p.ID] = p
	m.byOrder[p.OrderID] = p.ID
	if p.ExternalReference != nil {
		m.byExt[p.Provider+"|"+*p.ExternalReference] = p.ID
	}
	return nil
}

func (m *Memory) Update(_ context.Context, p domain.Payment) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	p.Version++
	m.byID[p.ID] = p
	if p.ExternalReference != nil {
		m.byExt[p.Provider+"|"+*p.ExternalReference] = p.ID
	}
	return nil
}

func (m *Memory) Get(_ context.Context, id string) (domain.Payment, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.byID[id]
	if !ok {
		return domain.Payment{}, domain.ErrNotFound
	}
	return p, nil
}

func (m *Memory) GetByOrder(_ context.Context, orderID string) (domain.Payment, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id, ok := m.byOrder[orderID]
	if !ok {
		return domain.Payment{}, domain.ErrNotFound
	}
	return m.byID[id], nil
}

func (m *Memory) GetByExternal(ctx context.Context, provider, ref string) (domain.Payment, error) {
	return m.GetByExternalForUpdate(ctx, provider, ref)
}

func (m *Memory) GetForUpdate(ctx context.Context, id string) (domain.Payment, error) {
	return m.Get(ctx, id)
}

func (m *Memory) GetByExternalForUpdate(_ context.Context, provider, ref string) (domain.Payment, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id, ok := m.byExt[provider+"|"+ref]
	if !ok {
		return domain.Payment{}, domain.ErrNotFound
	}
	return m.byID[id], nil
}

func (m *Memory) InsertInbox(_ context.Context, ev domain.WebhookEvent) (domain.WebhookEvent, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	k := inboxKey(ev.Provider, ev.ExternalEventID)
	if existing, ok := m.inbox[k]; ok {
		return existing, false, nil
	}
	m.inbox[k] = ev
	return ev, true, nil
}

func (m *Memory) GetInboxForUpdate(_ context.Context, provider, eventID string) (domain.WebhookEvent, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	ev, ok := m.inbox[inboxKey(provider, eventID)]
	if !ok {
		return domain.WebhookEvent{}, domain.ErrNotFound
	}
	return ev, nil
}

func (m *Memory) MarkInbox(_ context.Context, ev domain.WebhookEvent) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.inbox[inboxKey(ev.Provider, ev.ExternalEventID)] = ev
	return nil
}

func (m *Memory) InsertRecon(_ context.Context, rec domain.Reconciliation) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.recon[rec.ID] = rec
	return nil
}

func (m *Memory) ListRecon(_ context.Context, status string, limit int, cursorAt *time.Time, cursorID string) ([]domain.Reconciliation, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []domain.Reconciliation
	for _, r := range m.recon {
		if status != "" && string(r.Status) != status {
			continue
		}
		if cursorAt != nil && (r.CreatedAt.After(*cursorAt) || (r.CreatedAt.Equal(*cursorAt) && r.ID >= cursorID)) {
			continue
		}
		out = append(out, r)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].CreatedAt.Equal(out[j].CreatedAt) {
			return out[i].ID < out[j].ID
		}
		return out[i].CreatedAt.Before(out[j].CreatedAt)
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (m *Memory) GetReconForUpdate(_ context.Context, id string) (domain.Reconciliation, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.recon[id]
	if !ok {
		return domain.Reconciliation{}, domain.ErrNotFound
	}
	return r, nil
}

func (m *Memory) UpdateRecon(_ context.Context, rec domain.Reconciliation) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.recon[rec.ID] = rec
	return nil
}

func (m *Memory) InsertRefund(_ context.Context, r domain.Refund) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.refunds[r.ID] = r
	return nil
}

func (m *Memory) GetRefund(_ context.Context, id string) (domain.Refund, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.refunds[id]
	if !ok {
		return domain.Refund{}, domain.ErrNotFound
	}
	return r, nil
}

func (m *Memory) GetRefundForUpdate(ctx context.Context, id string) (domain.Refund, error) {
	return m.GetRefund(ctx, id)
}

func (m *Memory) GetRefundByExternal(_ context.Context, paymentID, ref string) (domain.Refund, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, r := range m.refunds {
		if r.ExternalReference != nil && *r.ExternalReference == ref {
			if paymentID == "" || r.PaymentID == paymentID {
				return r, nil
			}
		}
	}
	return domain.Refund{}, domain.ErrNotFound
}

func (m *Memory) UpdateRefund(_ context.Context, r domain.Refund) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	r.Version++
	m.refunds[r.ID] = r
	return nil
}

func (m *Memory) SumRefunds(_ context.Context, paymentID string, includeRequested bool) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var n int64
	for _, r := range m.refunds {
		if r.PaymentID != paymentID {
			continue
		}
		switch r.Status {
		case domain.RefundRejected, domain.RefundFailed:
			continue
		case domain.RefundRequested, domain.RefundApproved, domain.RefundProcessing, domain.RefundCompleted:
			if r.Status == domain.RefundRequested && !includeRequested {
				continue
			}
			n += r.AmountRupiah
		}
	}
	return n, nil
}

func (m *Memory) SumCompleted(_ context.Context, orderID string) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var n int64
	for _, r := range m.refunds {
		if r.OrderID == orderID && r.Status == domain.RefundCompleted {
			n += r.AmountRupiah
		}
	}
	return n, nil
}

func (m *Memory) ClaimIdempotency(_ context.Context, rec orderdomain.Idempotency) (orderdomain.Idempotency, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	k := rec.ActorUserID + "|" + rec.Scope + "|" + rec.KeyHash
	if existing, ok := m.idem[k]; ok {
		return existing, false, nil
	}
	m.idem[k] = rec
	return rec, true, nil
}

func (m *Memory) CompleteIdempotency(_ context.Context, actor, scope, keyHash string, httpStatus int, resourceID string, body []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	k := actor + "|" + scope + "|" + keyHash
	rec := m.idem[k]
	st := orderdomain.IdempotencyDone
	rt := "Payment"
	rec.Status = st
	rec.HTTPStatus = &httpStatus
	rec.ResourceType = &rt
	rec.ResourceID = &resourceID
	rec.ResponseBody = body
	m.idem[k] = rec
	return nil
}

func (m *Memory) OpenReconCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, r := range m.recon {
		if r.Status == domain.ReconOpen {
			n++
		}
	}
	return n
}
