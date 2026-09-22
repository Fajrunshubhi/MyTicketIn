package application

import (
	"context"
	"strings"
	"time"

	orgdomain "myticketin/internal/modules/organizers/domain"
	"myticketin/internal/modules/reporting/domain"
)

type Memory struct {
	OrgID   string
	OwnerID string
	Events  map[string]domain.EventRow
	Summary domain.Summary
	Parts   []domain.Participant
	Queue   []domain.QueueItem
	Current domain.Candidate
	Cands   []domain.Candidate
	Signals map[string]domain.Signal
	DBNow   time.Time
	ByEvent []domain.SalesBar
	ByCategory []domain.SalesBar
	ByType []domain.SalesBar
}

func NewMemory() *Memory {
	return &Memory{Events: map[string]domain.EventRow{}, Signals: map[string]domain.Signal{}, DBNow: time.Now().UTC()}
}

func (m *Memory) OrganizerID(_ context.Context, ownerUserID string) (string, error) {
	if m.OwnerID != "" && m.OwnerID != ownerUserID {
		return "", orgdomain.ErrNotApproved
	}
	if m.OrgID == "" {
		return "", orgdomain.ErrRequired
	}
	return m.OrgID, nil
}

func (m *Memory) EventOwned(_ context.Context, organizerID, eventID string) (bool, error) {
	_, ok := m.Events[eventID]
	return ok && organizerID == m.OrgID, nil
}

func (m *Memory) Aggregate(_ context.Context, _, _ string, _ domain.Range) (domain.Summary, error) {
	return m.Summary, nil
}

func (m *Memory) ListEvents(_ context.Context, _ string, _ domain.Range, limit int, _ *time.Time, _ string) ([]domain.EventRow, error) {
	var out []domain.EventRow
	for _, e := range m.Events {
		out = append(out, e)
	}
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (m *Memory) SalesBreakdown(_ context.Context, _, _ string, _ domain.Range) ([]domain.SalesBar, []domain.SalesBar, []domain.SalesBar, error) {
	if len(m.ByEvent) > 0 || len(m.ByCategory) > 0 || len(m.ByType) > 0 {
		return m.ByEvent, m.ByCategory, m.ByType, nil
	}
	var events []domain.SalesBar
	for _, e := range m.Events {
		events = append(events, domain.SalesBar{
			Key: e.ID, Label: e.Title, TicketsSold: e.TicketsSold, GrossSandboxRupiah: e.GrossSandboxRupiah,
		})
	}
	return events, []domain.SalesBar{}, []domain.SalesBar{}, nil
}

func (m *Memory) SalesTrend(_ context.Context, _, _, _ string, _ domain.Range) ([]map[string]any, domain.Summary, string, error) {
	return []map[string]any{}, m.Summary, "Asia/Jakarta", nil
}

func (m *Memory) ListParticipants(_ context.Context, _, _, _, _ string, _ domain.Range, after string, limit int) ([]domain.Participant, error) {
	var out []domain.Participant
	for _, p := range m.Parts {
		if after != "" && p.ID <= after {
			continue
		}
		out = append(out, p)
		if len(out) >= limit {
			break
		}
	}
	return out, nil
}

func (m *Memory) ListQueue(_ context.Context, queue string, limit int, _ *time.Time, _ string) ([]domain.QueueItem, error) {
	var out []domain.QueueItem
	for _, q := range m.Queue {
		if queue != "" && !strings.EqualFold(q.ReasonCode, queue) && q.EntityType != queue {
			if q.ReasonCode != strings.ToUpper(strings.ReplaceAll(queue, "-", "_")) {
				continue
			}
		}
		out = append(out, q)
		if len(out) >= limit {
			break
		}
	}
	return out, nil
}

func (m *Memory) PublicEvent(_ context.Context, slug string) (domain.Candidate, error) {
	if m.Current.Slug != slug && m.Current.ID != slug {
		return domain.Candidate{}, domain.ErrNotFound
	}
	return m.Current, nil
}

func (m *Memory) PaidSignals(_ context.Context, buyerID string) (domain.Signal, error) {
	return m.Signals[buyerID], nil
}

func (m *Memory) Candidates(_ context.Context, excludeID string, purchased []string, now time.Time) ([]domain.Candidate, error) {
	skip := map[string]struct{}{excludeID: {}}
	for _, id := range purchased {
		skip[id] = struct{}{}
	}
	var out []domain.Candidate
	for _, c := range m.Cands {
		if _, ok := skip[c.ID]; ok {
			continue
		}
		if !c.StartsAt.After(now) {
			continue
		}
		out = append(out, c)
	}
	return out, nil
}

func (m *Memory) Now(_ context.Context) (time.Time, error) { return m.DBNow, nil }
