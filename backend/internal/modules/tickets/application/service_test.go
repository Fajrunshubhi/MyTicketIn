package application

import (
	"context"
	"fmt"
	"testing"
	"time"

	authdomain "myticketin/internal/modules/auth/domain"
	eventdomain "myticketin/internal/modules/events/domain"
	orderdomain "myticketin/internal/modules/orders/domain"
	paydomain "myticketin/internal/modules/payments/domain"
	ticketdomain "myticketin/internal/modules/tickets/domain"
	ticketinfra "myticketin/internal/modules/tickets/infrastructure"
)

func testCrypto() ticketdomain.Crypto {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 1)
	}
	return ticketdomain.Crypto{Pepper: "pepper-value-32-chars-minimum-ok!", ActiveVersion: 1, Keys: map[int][]byte{1: key}}
}

func paidOrder(qty int) orderdomain.Order {
	atts := make([]orderdomain.AttendeeInput, qty)
	for i := 0; i < qty; i++ {
		k := i + 1
		atts[i] = orderdomain.AttendeeInput{
			FullName: fmt.Sprintf("Pemegang %d", k), Email: fmt.Sprintf("h%d@example.com", k),
			Phone: fmt.Sprintf("0812345%05d", k), IdentityNumber: fmt.Sprintf("317409%010d", k),
		}
	}
	return orderdomain.Order{
		ID: "ord1", OrderNumber: "ORD-1", BuyerUserID: "u1", EventID: "evt1", Status: orderdomain.StatusPaid,
		Items: []orderdomain.Item{{ID: "oi1", OrderID: "ord1", TicketTypeID: "tt1", TicketTypeName: "Reguler", Quantity: qty, Attendees: atts}},
	}
}

func TestIssueForPaidOrderExactlyOnce(t *testing.T) {
	mem := NewMemory()
	mem.PutEvent(eventdomain.Event{ID: "evt1", Slug: "konser", Title: "Konser", Timezone: "Asia/Jakarta", VenueName: "GBK", City: "Jakarta", StartsAt: time.Now().UTC().Add(time.Hour)})
	mem.PutOrder(paidOrder(2))
	mem.PutUser("u1", "Pembeli Satu")
	svc := NewService(mem, testCrypto(), ticketinfra.QRRenderer{})
	o := paidOrder(2)
	if err := svc.IssueForPaidOrder(context.Background(), o, "c1"); err != nil {
		t.Fatal(err)
	}
	if err := svc.IssueForPaidOrder(context.Background(), o, "c1"); err != nil {
		t.Fatal(err)
	}
	n, err := mem.CountOrder(context.Background(), "ord1")
	if err != nil || n != 2 {
		t.Fatalf("count %d %v", n, err)
	}
	if err := svc.CanRefund("ord1"); err != nil {
		t.Fatal(err)
	}
}

func TestCancelUnusedAndQR(t *testing.T) {
	mem := NewMemory()
	mem.PutEvent(eventdomain.Event{ID: "evt1", Slug: "konser", Title: "Konser", Timezone: "Asia/Jakarta", VenueName: "GBK", City: "Jakarta", AddressLine: "Senayan", Province: "DKI", StartsAt: time.Now().UTC().Add(time.Hour), EndsAt: time.Now().UTC().Add(2 * time.Hour)})
	mem.PutOrder(paidOrder(1))
	mem.PutUser("u1", "Pembeli Satu")
	svc := NewService(mem, testCrypto(), ticketinfra.QRRenderer{})
	if err := svc.IssueForPaidOrder(context.Background(), paidOrder(1), "c1"); err != nil {
		t.Fatal(err)
	}
	buyer := authdomain.User{ID: "u1", Role: authdomain.RoleUser, Status: authdomain.StatusActive}
	items, _, err := svc.List(context.Background(), buyer, "", "", 20)
	if err != nil || len(items) != 1 {
		t.Fatalf("%v %#v", err, items)
	}
	png, err := svc.RenderQR(context.Background(), buyer, items[0].ID, "1.1.1.1")
	if err != nil || len(png) < 100 {
		t.Fatal(err, len(png))
	}
	if _, err := svc.Get(context.Background(), authdomain.User{ID: "other", Role: authdomain.RoleUser, Status: authdomain.StatusActive}, items[0].ID); err != ticketdomain.ErrNotFound {
		t.Fatal(err)
	}
	if err := svc.CancelUnusedForEvent(context.Background(), "evt1"); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.RenderQR(context.Background(), buyer, items[0].ID, "1.1.1.1"); err != ticketdomain.ErrQRUnavailable {
		t.Fatal(err)
	}
}

func TestUsedBlocksRefund(t *testing.T) {
	mem := NewMemory()
	mem.PutOrder(paidOrder(1))
	svc := NewService(mem, testCrypto(), ticketinfra.QRRenderer{})
	if err := svc.IssueForPaidOrder(context.Background(), paidOrder(1), "c1"); err != nil {
		t.Fatal(err)
	}
	var id string
	for _, tkt := range mem.tickets {
		id = tkt.ID
	}
	mem.MarkUsed(id, time.Now().UTC())
	if err := svc.CanRefund("ord1"); err != paydomain.ErrFulfillmentBlocked {
		t.Fatal(err)
	}
}
