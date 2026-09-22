package application

import (
	"context"
	"errors"
	"testing"
	"time"

	"myticketin/internal/modules/analytics/domain"
)

type memStore struct {
	events []domain.Event
	fail   bool
}

func (m *memStore) Insert(ctx context.Context, ev domain.Event) (bool, error) {
	if m.fail {
		return false, errors.New("boom")
	}
	for _, existing := range m.events {
		if ev.DeduplicationKey != nil && existing.DeduplicationKey != nil && *existing.DeduplicationKey == *ev.DeduplicationKey {
			return false, nil
		}
	}
	m.events = append(m.events, ev)
	return true, nil
}

func TestRegistryAcceptsMinimumPayload(t *testing.T) {
	store := &memStore{}
	em := &Emitter{Store: store, Metrics: &Metrics{}, Now: func() time.Time { return time.Date(2026, 9, 21, 10, 0, 0, 0, time.UTC) }}
	for _, name := range domain.AllNames() {
		err := em.Emit(context.Background(), Input{
			Name:          name,
			SchemaVersion: domain.SchemaVersion,
			Properties:    map[string]any{"source": "test"},
			AnonymousSeed: "anon",
		})
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
	}
	if len(store.events) != len(domain.AllNames()) {
		t.Fatalf("got %d", len(store.events))
	}
}

func TestRejectsUnknownAndPIIProperties(t *testing.T) {
	em := &Emitter{Store: &memStore{}, Metrics: &Metrics{}}
	if err := em.Emit(context.Background(), Input{Name: "not_a_real_event", Client: true}); err != ErrNotAllowed {
		t.Fatalf("foreign: %v", err)
	}
	if err := em.Emit(context.Background(), Input{Name: "login_succeeded", Properties: map[string]any{"email": "a@b.test"}}); err != ErrInvalid {
		t.Fatalf("pii: %v", err)
	}
	if err := em.Emit(context.Background(), Input{Name: "user_registered", Client: true}); err != ErrNotAllowed {
		t.Fatalf("server event from client: %v", err)
	}
}

func TestDedupKeyOneRow(t *testing.T) {
	store := &memStore{}
	em := &Emitter{Store: store, Metrics: &Metrics{}}
	in := Input{Name: "ticket_viewed", SchemaVersion: 1, DeduplicationKey: "k1", Properties: map[string]any{"source": "web", "entityType": "Ticket", "entityId": "t1"}, Client: true, AnonymousSeed: "ip"}
	if err := em.Emit(context.Background(), in); err != nil {
		t.Fatal(err)
	}
	if err := em.Emit(context.Background(), in); err != nil {
		t.Fatal(err)
	}
	if len(store.events) != 1 {
		t.Fatalf("rows %d", len(store.events))
	}
	if em.Metrics.Deduped.Load() != 1 {
		t.Fatalf("dedup metric %d", em.Metrics.Deduped.Load())
	}
}

func TestClientDoesNotTrustPayloadActor(t *testing.T) {
	store := &memStore{}
	em := &Emitter{Store: store, Metrics: &Metrics{}}
	err := em.Emit(context.Background(), Input{
		Name:          "ticket_viewed",
		Client:        true,
		AnonymousSeed: "ip-1",
		Properties:    map[string]any{"source": "web", "entityType": "Ticket", "entityId": "t9"},
	})
	if err != nil {
		t.Fatal(err)
	}
	ev := store.events[0]
	if ev.ActorUserID != nil {
		t.Fatal("anonymous client event must not carry a user actor")
	}
	if ev.AnonymousIDHash == nil {
		t.Fatal("anonymous hash required")
	}
}

func TestEmitFailureDegraded(t *testing.T) {
	em := &Emitter{Store: &memStore{fail: true}, Metrics: &Metrics{}}
	if err := em.Emit(context.Background(), Input{Name: "login_succeeded", AnonymousSeed: "x"}); err != ErrDegraded {
		t.Fatalf("%v", err)
	}
	if em.Metrics.Dropped.Load() != 1 {
		t.Fatalf("dropped %d", em.Metrics.Dropped.Load())
	}
}
