package application

import (
	"context"
	"sync"
	"testing"
	"time"

	authdomain "myticketin/internal/modules/auth/domain"
	"myticketin/internal/modules/checkin/domain"
	eventdomain "myticketin/internal/modules/events/domain"
	orgdomain "myticketin/internal/modules/organizers/domain"
	ticketdomain "myticketin/internal/modules/tickets/domain"
)

func setupCheck(t *testing.T) (*Service, *Memory, ticketdomain.Crypto, string, string) {
	t.Helper()
	mem := NewMemory()
	now := time.Date(2026, 9, 22, 10, 0, 0, 0, time.UTC)
	mem.PutEvent(eventdomain.Event{ID: "evt1", OrganizerProfileID: "org1", Title: "Konser", Status: eventdomain.StatusPublished, Timezone: "Asia/Jakarta", VenueName: "GBK", StartsAt: now.Add(time.Hour)})
	mem.PutProfile(orgdomain.Profile{ID: "org1", OwnerUserID: "owner1", Name: "Org"})
	mem.PutUser("owner1", "Owner")
	mem.PutUser("staff1", "Staff")
	key := make([]byte, 32)
	crypto := ticketdomain.Crypto{Pepper: "pepper-value-32-chars-minimum-ok!", ActiveVersion: 1, Keys: map[int][]byte{1: key}}
	tok, err := ticketdomain.NewToken()
	if err != nil {
		t.Fatal(err)
	}
	manual, err := ticketdomain.NewManualCode()
	if err != nil {
		t.Fatal(err)
	}
	mem.PutTicket(domain.TicketView{
		ID: "t1", EventID: "evt1", Status: "UNUSED", OrderStatus: "PAID", TicketNumber: "TIX-ABCDEFGHIJ", TicketTypeName: "Reguler",
	}, crypto.Hash(tok), manual)
	svc := NewService(mem, crypto.Pepper, "fingerprint-secret-32-chars-min!!")
	svc.Now = func() time.Time { return now }
	return svc, mem, crypto, tok, manual
}

func owner() authdomain.User {
	return authdomain.User{ID: "owner1", Role: authdomain.RoleUser, Status: authdomain.StatusActive}
}

func TestCheckInValidThenAlreadyUsed(t *testing.T) {
	svc, _, _, tok, _ := setupCheck(t)
	acc, err := svc.ScannerAccess(context.Background(), owner(), "evt1")
	if err != nil || acc.Permissions["scan"] != true {
		t.Fatal(err, acc)
	}
	first, err := svc.CheckIn(context.Background(), owner(), "evt1", domain.Input{Type: domain.InputQR, Raw: tok}, "idempotency-key-01x", "1.1.1.1")
	if err != nil || first.Result != domain.ResultValid {
		t.Fatalf("%#v %v", first, err)
	}
	replay, err := svc.CheckIn(context.Background(), owner(), "evt1", domain.Input{Type: domain.InputQR, Raw: tok}, "idempotency-key-01x", "1.1.1.1")
	if err != nil || replay.AttemptID != first.AttemptID {
		t.Fatal(err, replay)
	}
	second, err := svc.CheckIn(context.Background(), owner(), "evt1", domain.Input{Type: domain.InputQR, Raw: tok}, "idempotency-key-02x", "1.1.1.1")
	if err != nil || second.Result != domain.ResultAlreadyUsed {
		t.Fatalf("%#v %v", second, err)
	}
}

func TestCheckInManualAndUnknown(t *testing.T) {
	svc, _, _, _, manual := setupCheck(t)
	ok, err := svc.CheckIn(context.Background(), owner(), "evt1", domain.Input{Type: domain.InputManual, Raw: manual}, "idempotency-key-m01", "")
	if err != nil || ok.Result != domain.ResultValid {
		t.Fatal(err, ok)
	}
	bad, err := svc.CheckIn(context.Background(), owner(), "evt1", domain.Input{Type: domain.InputQR, Raw: "not-a-token"}, "idempotency-key-bad1", "")
	if err != nil || bad.Result != domain.ResultInvalid || bad.ReasonCode != domain.ReasonFormat {
		t.Fatal(err, bad)
	}
}

func TestCheckInWrongEventAndStaff(t *testing.T) {
	svc, mem, crypto, tok, _ := setupCheck(t)
	mem.PutEvent(eventdomain.Event{ID: "evt2", OrganizerProfileID: "org1", Title: "Lain", Status: eventdomain.StatusPublished, Timezone: "Asia/Jakarta", StartsAt: time.Now().UTC()})
	other, err := ticketdomain.NewToken()
	if err != nil {
		t.Fatal(err)
	}
	mem.PutTicket(domain.TicketView{ID: "t2", EventID: "evt2", Status: "UNUSED", OrderStatus: "PAID", TicketNumber: "TIX-OTHERXXXX", TicketTypeName: "VIP"}, crypto.Hash(other), "")
	out, err := svc.CheckIn(context.Background(), owner(), "evt1", domain.Input{Type: domain.InputQR, Raw: other}, "idempotency-key-we01", "")
	if err != nil || out.Result != domain.ResultWrongEvent || out.Ticket != nil {
		t.Fatal(err, out)
	}
	staff := authdomain.User{ID: "staff1", Role: authdomain.RoleUser, Status: authdomain.StatusActive}
	if _, err := svc.ScannerAccess(context.Background(), staff, "evt1"); err == nil {
		t.Fatal("expected deny")
	}
	mem.PutStaff(eventdomain.StaffAssignment{EventID: "evt1", UserID: "staff1", Status: eventdomain.StaffActive})
	if _, err := svc.ScannerAccess(context.Background(), staff, "evt1"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.ListAttempts(context.Background(), staff, "evt1", "", "", "", "", 25); err == nil {
		t.Fatal("staff cannot list")
	}
	_ = tok
}

func TestConcurrentValidOneSuccess(t *testing.T) {
	svc, _, _, tok, _ := setupCheck(t)
	var wg sync.WaitGroup
	got := make([]domain.Result, 8)
	wg.Add(8)
	for i := 0; i < 8; i++ {
		i := i
		go func() {
			defer wg.Done()
			key := "idempotency-key-c0" + string(rune('a'+i)) + "xxxxxxx"
			out, err := svc.CheckIn(context.Background(), owner(), "evt1", domain.Input{Type: domain.InputQR, Raw: tok}, key, "")
			if err != nil {
				t.Errorf("%v", err)
				return
			}
			got[i] = out.Result
		}()
	}
	wg.Wait()
	valid := 0
	for _, r := range got {
		if r == domain.ResultValid {
			valid++
		}
	}
	if valid != 1 {
		t.Fatalf("valid=%d %#v", valid, got)
	}
}
