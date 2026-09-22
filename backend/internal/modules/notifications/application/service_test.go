package application

import (
	"context"
	"testing"

	authdomain "myticketin/internal/modules/auth/domain"
	"myticketin/internal/modules/notifications/domain"
)

func TestEnqueueDedupAndDispatch(t *testing.T) {
	mem := NewMemory()
	mail := &SandboxMailer{}
	svc := NewService(mem, mail, "cursor-secret-32-chars-minimum-ok")
	cmd := domain.Command{DomainEventID: "pay:1", RecipientID: "u1", Type: domain.TypePaymentSucceeded, ActionPath: "/orders/o1"}
	if err := svc.Enqueue(context.Background(), cmd); err != nil {
		t.Fatal(err)
	}
	if err := svc.Enqueue(context.Background(), cmd); err != nil {
		t.Fatal(err)
	}
	if mem.CountOutbox() != 1 {
		t.Fatal(mem.CountOutbox())
	}
	n, err := svc.Dispatch(context.Background(), 10)
	if err != nil || n != 1 {
		t.Fatal(n, err)
	}
	if mail.Sent != 1 {
		t.Fatal(mail.Sent)
	}
	actor := authdomain.User{ID: "u1", Status: authdomain.StatusActive}
	out, err := svc.List(context.Background(), actor, "all", "", 20)
	if err != nil {
		t.Fatal(err)
	}
	if out["unreadCount"].(int) != 1 {
		t.Fatal(out)
	}
}

func TestMarkReadIsolation(t *testing.T) {
	mem := NewMemory()
	svc := NewService(mem, &SandboxMailer{}, "cursor-secret-32-chars-minimum-ok")
	note, _ := mem.UpsertInApp(context.Background(), domain.Notification{RecipientID: "a", Type: domain.TypeTicketIssued, Title: "t", Body: "b", DedupKey: "k"})
	_, err := svc.MarkRead(context.Background(), authdomain.User{ID: "b", Status: authdomain.StatusActive}, note.ID)
	if err != domain.ErrNotFound {
		t.Fatal(err)
	}
}

func TestReminderDedup(t *testing.T) {
	mem := NewMemory()
	svc := NewService(mem, &SandboxMailer{}, "cursor-secret-32-chars-minimum-ok")
	mem.Cands = []domain.ReminderCandidate{{EventID: "e1", RecipientID: "u1", Title: "Konser", Venue: "GBK", Timezone: "Asia/Jakarta"}}
	mem.Eligible["e1|u1"] = true
	a, err := svc.ProduceReminders(context.Background(), 10)
	if err != nil {
		t.Fatal(err)
	}
	b, err := svc.ProduceReminders(context.Background(), 10)
	if err != nil {
		t.Fatal(err)
	}
	if a["enqueued"].(int) != 1 {
		t.Fatal(a)
	}
	if b["enqueued"].(int) != 0 && mem.CountOutbox() != 1 {
		t.Fatal(b, mem.CountOutbox())
	}
	if mem.CountOutbox() != 1 {
		t.Fatal(mem.CountOutbox())
	}
}

func TestEmailFailureKeepsInApp(t *testing.T) {
	mem := NewMemory()
	svc := NewService(mem, &SandboxMailer{Fail: true}, "cursor-secret-32-chars-minimum-ok")
	_ = svc.Enqueue(context.Background(), domain.Command{DomainEventID: "x", RecipientID: "u1", Type: domain.TypeTicketIssued})
	_, _ = svc.Dispatch(context.Background(), 10)
	if len(mem.Notes) != 1 {
		t.Fatal("in-app missing")
	}
}
