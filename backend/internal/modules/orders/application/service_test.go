package application

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	authdomain "myticketin/internal/modules/auth/domain"
	eventdomain "myticketin/internal/modules/events/domain"
	loyaltydomain "myticketin/internal/modules/loyalty/domain"
	"myticketin/internal/modules/orders/domain"
	orgdomain "myticketin/internal/modules/organizers/domain"
)

func seedPublished(mem *Memory, mode eventdomain.InventoryMode) (eventdomain.Event, eventdomain.TicketType) {
	now := time.Date(2026, 9, 22, 4, 0, 0, 0, time.UTC)
	mem.now = func() time.Time { return now }
	e := eventdomain.Event{
		ID: "evt1", OrganizerProfileID: "org1", Slug: "konser", Title: "Konser", Status: eventdomain.StatusPublished,
		InventoryMode: mode, StartsAt: now.Add(48 * time.Hour), EndsAt: now.Add(50 * time.Hour), Timezone: "Asia/Jakarta",
	}
	t := eventdomain.TicketType{
		ID: "tt1", EventID: "evt1", Name: "Festival", PriceRupiah: 100000, Quota: 10, MaxPerAccount: 5,
		SaleStartsAt: now.Add(-time.Hour), SaleEndsAt: now.Add(24 * time.Hour),
	}
	var seats []eventdomain.Seat
	var secs []eventdomain.Section
	if mode == eventdomain.ModeReserved {
		secs = []eventdomain.Section{{ID: "sec1", EventID: "evt1", TicketTypeID: "tt1", Name: "A"}}
		seats = []eventdomain.Seat{{ID: "seat1", EventID: "evt1", SectionID: "sec1", Label: "A1"}, {ID: "seat2", EventID: "evt1", SectionID: "sec1", Label: "A2"}}
	}
	mem.PutEvent(e, []eventdomain.TicketType{t}, secs, seats)
	mem.PutOrganizer(orgdomain.Profile{ID: "org1", Name: "Org Satu"})
	return e, t
}

func buyer(id string) authdomain.User {
	return authdomain.User{ID: id, Role: authdomain.RoleUser, Status: authdomain.StatusActive}
}

func holders(n, seed int) []domain.AttendeeInput {
	out := make([]domain.AttendeeInput, n)
	for i := 0; i < n; i++ {
		k := seed*100 + i + 1
		out[i] = domain.AttendeeInput{
			FullName:       fmt.Sprintf("Pemegang %d", k),
			Email:          fmt.Sprintf("holder%d@example.com", k),
			Phone:          fmt.Sprintf("0812345%05d", k),
			IdentityNumber: fmt.Sprintf("317409%010d", k),
		}
	}
	return out
}

func gaLine(qty, seed int) domain.LineInput {
	return domain.LineInput{TicketTypeID: "tt1", Quantity: qty, Attendees: holders(qty, seed)}
}

func TestCreateOrderGAAndReplay(t *testing.T) {
	mem := NewMemory()
	seedPublished(mem, eventdomain.ModeGA)
	svc := NewService(mem)
	svc.Now = mem.now
	svc.Profiles = mem
	in := domain.CheckoutInput{EventID: "evt1", Items: []domain.LineInput{gaLine(2, 1)}, Confirmed: true}
	first, replay, err := svc.Create(context.Background(), buyer("u1"), in, "idempotency-key-01", "1.1.1.1")
	if err != nil || replay || first.Status != domain.StatusPending || first.SubtotalRupiah != 200000 {
		t.Fatalf("create %#v %v", first, err)
	}
	if mem.Ticket("tt1").ReservedQuantity != 2 {
		t.Fatal("reserved")
	}
	second, replay, err := svc.Create(context.Background(), buyer("u1"), in, "idempotency-key-01", "1.1.1.1")
	if err != nil || !replay || second.ID != first.ID {
		t.Fatalf("replay %v %v %#v", replay, err, second)
	}
	in.Items[0].Quantity = 1
	in.Items[0].Attendees = holders(1, 1)
	_, _, err = svc.Create(context.Background(), buyer("u1"), in, "idempotency-key-01", "1.1.1.1")
	if !errors.Is(err, domain.ErrKeyReused) {
		t.Fatalf("reuse %v", err)
	}
}

func TestModeMismatchAndSeatHold(t *testing.T) {
	mem := NewMemory()
	seedPublished(mem, eventdomain.ModeGA)
	svc := NewService(mem)
	svc.Now = mem.now
	_, _, err := svc.Create(context.Background(), buyer("u1"), domain.CheckoutInput{EventID: "evt1", SeatIDs: []string{"seat1"}, Confirmed: true}, "idempotency-key-02a", "")
	if !errors.Is(err, domain.ErrModeMismatch) {
		t.Fatalf("ga seats %v", err)
	}
	mem = NewMemory()
	seedPublished(mem, eventdomain.ModeReserved)
	svc = NewService(mem)
	svc.Now = mem.now
	_, _, err = svc.Create(context.Background(), buyer("u1"), domain.CheckoutInput{EventID: "evt1", Items: []domain.LineInput{{TicketTypeID: "tt1", Quantity: 1}}, Confirmed: true}, "idempotency-key-02b", "")
	if !errors.Is(err, domain.ErrModeMismatch) {
		t.Fatalf("reserved items %v", err)
	}
	_, _, err = svc.Create(context.Background(), buyer("u1"), domain.CheckoutInput{EventID: "evt1", SeatIDs: []string{"seat1"}, Attendees: holders(1, 3), Confirmed: true}, "idempotency-key-02c", "")
	if err != nil {
		t.Fatal(err)
	}
	_, _, err = svc.Create(context.Background(), buyer("u2"), domain.CheckoutInput{EventID: "evt1", SeatIDs: []string{"seat1"}, Attendees: holders(1, 4), Confirmed: true}, "idempotency-key-02d", "")
	if !errors.Is(err, domain.ErrSeatUnavailable) {
		t.Fatalf("double seat %v", err)
	}
}

func TestPurchaseLimitAndPartialRollback(t *testing.T) {
	mem := NewMemory()
	t2 := eventdomain.TicketType{ID: "tt2", EventID: "evt1", Name: "VIP", PriceRupiah: 200000, Quota: 1, MaxPerAccount: 5, SaleStartsAt: time.Time{}, SaleEndsAt: time.Time{}}
	e, t1 := seedPublished(mem, eventdomain.ModeGA)
	t2.SaleStartsAt, t2.SaleEndsAt = t1.SaleStartsAt, t1.SaleEndsAt
	mem.PutEvent(e, []eventdomain.TicketType{t1, t2}, nil, nil)
	svc := NewService(mem)
	svc.Now = mem.now
	in := domain.CheckoutInput{EventID: "evt1", Items: []domain.LineInput{gaLine(5, 1)}, Confirmed: true}
	if _, _, err := svc.Create(context.Background(), buyer("u1"), in, "idempotency-key-03a", ""); err != nil {
		t.Fatal(err)
	}
	_, _, err := svc.Create(context.Background(), buyer("u1"), domain.CheckoutInput{EventID: "evt1", Items: []domain.LineInput{gaLine(1, 2)}, Confirmed: true}, "idempotency-key-03b", "")
	if err != nil {
		t.Fatalf("second purchase same account %v", err)
	}
	_, _, err = svc.Create(context.Background(), buyer("u2"), domain.CheckoutInput{EventID: "evt1", Items: []domain.LineInput{
		{TicketTypeID: "tt1", Quantity: 2, Attendees: holders(2, 3)},
		{TicketTypeID: "tt2", Quantity: 2, Attendees: holders(2, 4)},
	}, Confirmed: true}, "idempotency-key-03c", "")
	if !errors.Is(err, domain.ErrInventory) {
		t.Fatalf("multi %v", err)
	}
	if mem.Ticket("tt1").ReservedQuantity != 6 || mem.Ticket("tt2").ReservedQuantity != 0 {
		t.Fatalf("partial reserved tt1=%d tt2=%d", mem.Ticket("tt1").ReservedQuantity, mem.Ticket("tt2").ReservedQuantity)
	}
	dup := holders(1, 1)[0]
	_, _, err = svc.Create(context.Background(), buyer("u3"), domain.CheckoutInput{EventID: "evt1", Items: []domain.LineInput{{TicketTypeID: "tt1", Quantity: 1, Attendees: []domain.AttendeeInput{dup}}}, Confirmed: true}, "idempotency-key-03d", "")
	if !errors.Is(err, domain.ErrAttendeeDuplicate) {
		t.Fatalf("duplicate holder %v", err)
	}
}

func TestLoyaltyReserveAndExpireReleases(t *testing.T) {
	mem := NewMemory()
	seedPublished(mem, eventdomain.ModeGA)
	mem.PutLoyalty("u1", "org1", 50, 0, 0)
	svc := NewService(mem)
	svc.Now = mem.now
	svc.Profiles = mem
	_, _, err := svc.Create(context.Background(), buyer("u1"), domain.CheckoutInput{EventID: "evt1", Items: []domain.LineInput{gaLine(1, 1)}, RedeemPoints: 2001, Confirmed: true}, "idempotency-key-04a", "")
	if !errors.Is(err, loyaltydomain.ErrRedemptionLimit) {
		t.Fatalf("cap %v", err)
	}
	ord, _, err := svc.Create(context.Background(), buyer("u1"), domain.CheckoutInput{EventID: "evt1", Items: []domain.LineInput{gaLine(1, 1)}, RedeemPoints: 10, Confirmed: true}, "idempotency-key-04b", "")
	if err != nil || ord.RedeemedPoints != 10 || ord.LoyaltyDiscountRupiah != 100 || ord.TotalPayableRupiah != 99900 {
		t.Fatalf("order %#v %v", ord, err)
	}
	if mem.Loyalty("u1", "org1").ReservedPoints != 10 {
		t.Fatal("reserved points")
	}
	svc.Now = func() time.Time { return mem.now().Add(16 * time.Minute) }
	res, err := svc.ExpireDue(context.Background(), 100)
	if err != nil || res.Expired != 1 {
		t.Fatalf("expire %#v %v", res, err)
	}
	if mem.Ticket("tt1").ReservedQuantity != 0 {
		t.Fatal("inventory release")
	}
	if mem.Loyalty("u1", "org1").ReservedPoints != 0 {
		t.Fatal("points release")
	}
	got, _ := svc.Get(context.Background(), buyer("u1"), ord.ID)
	if got.Status != domain.StatusExpired {
		t.Fatalf("status %s", got.Status)
	}
	_, err = svc.ExpireDue(context.Background(), 100)
	if err != nil {
		t.Fatal(err)
	}
}

func TestOwnerIsolation(t *testing.T) {
	mem := NewMemory()
	seedPublished(mem, eventdomain.ModeGA)
	svc := NewService(mem)
	svc.Now = mem.now
	ord, _, err := svc.Create(context.Background(), buyer("u1"), domain.CheckoutInput{EventID: "evt1", Items: []domain.LineInput{gaLine(1, 1)}, Confirmed: true}, "idempotency-key-05a", "")
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.Get(context.Background(), buyer("u2"), ord.ID)
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("leak %v", err)
	}
}

func TestLastUnitExactlyOne(t *testing.T) {
	mem := NewMemory()
	e, t1 := seedPublished(mem, eventdomain.ModeGA)
	t1.Quota = 1
	mem.PutEvent(e, []eventdomain.TicketType{t1}, nil, nil)
	svc := NewService(mem)
	svc.Now = mem.now
	_, _, err1 := svc.Create(context.Background(), buyer("u1"), domain.CheckoutInput{EventID: "evt1", Items: []domain.LineInput{gaLine(1, 1)}, Confirmed: true}, "idempotency-key-06a", "")
	_, _, err2 := svc.Create(context.Background(), buyer("u2"), domain.CheckoutInput{EventID: "evt1", Items: []domain.LineInput{gaLine(1, 2)}, Confirmed: true}, "idempotency-key-06b", "")
	ok := 0
	if err1 == nil {
		ok++
	}
	if err2 == nil {
		ok++
	}
	if ok != 1 {
		t.Fatalf("want 1 success got %d %v %v", ok, err1, err2)
	}
	if mem.Ticket("tt1").ReservedQuantity != 1 {
		t.Fatal("counter")
	}
}

func TestOrganizerCannotCheckout(t *testing.T) {
	mem := NewMemory()
	seedPublished(mem, eventdomain.ModeGA)
	svc := NewService(mem)
	svc.Now = mem.now
	svc.BuyerGate = func(context.Context, authdomain.User) error {
		return authdomain.ErrForbidden
	}
	_, _, err := svc.Create(context.Background(), buyer("org-owner"), domain.CheckoutInput{EventID: "evt1", Items: []domain.LineInput{{TicketTypeID: "tt1", Quantity: 1}}, Confirmed: true}, "idempotency-key-07a", "")
	if !errors.Is(err, authdomain.ErrForbidden) {
		t.Fatalf("organizer checkout %v", err)
	}
}
