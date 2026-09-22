package application

import (
	"context"
	"errors"
	"testing"
	"time"

	authdomain "myticketin/internal/modules/auth/domain"
	eventdomain "myticketin/internal/modules/events/domain"
	orderapp "myticketin/internal/modules/orders/application"
	orderdomain "myticketin/internal/modules/orders/domain"
	orgdomain "myticketin/internal/modules/organizers/domain"
	"myticketin/internal/modules/payments/domain"
	payinfra "myticketin/internal/modules/payments/infrastructure"
	ticketapp "myticketin/internal/modules/tickets/application"
	ticketdomain "myticketin/internal/modules/tickets/domain"
	ticketinfra "myticketin/internal/modules/tickets/infrastructure"
)

func setupPay(t *testing.T) (*Service, *orderapp.Memory, *Memory, *orderapp.Service, time.Time) {
	t.Helper()
	omem := orderapp.NewMemory()
	now := time.Date(2026, 9, 22, 4, 0, 0, 0, time.UTC)
	omem.PutEvent(eventdomain.Event{
		ID: "evt1", OrganizerProfileID: "org1", Slug: "konser", Title: "Konser", Status: eventdomain.StatusPublished,
		InventoryMode: eventdomain.ModeGA, StartsAt: now.Add(48 * time.Hour), EndsAt: now.Add(50 * time.Hour), Timezone: "Asia/Jakarta",
	}, []eventdomain.TicketType{{
		ID: "tt1", EventID: "evt1", Name: "Festival", PriceRupiah: 100000, Quota: 10, MaxPerAccount: 5,
		SaleStartsAt: now.Add(-time.Hour), SaleEndsAt: now.Add(24 * time.Hour),
	}}, nil, nil)
	omem.PutOrganizer(orgdomain.Profile{ID: "org1", Name: "Org Satu"})
	omem.PutLoyalty("u1", "org1", 5000, 0, 0)
	osvc := orderapp.NewService(omem)
	osvc.Now = func() time.Time { return now }
	osvc.Profiles = omem
	tmem := ticketapp.NewMemory()
	tmem.PutEvent(eventdomain.Event{
		ID: "evt1", OrganizerProfileID: "org1", Slug: "konser", Title: "Konser", Status: eventdomain.StatusPublished,
		InventoryMode: eventdomain.ModeGA, StartsAt: now.Add(48 * time.Hour), EndsAt: now.Add(50 * time.Hour), Timezone: "Asia/Jakarta",
	})
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 7)
	}
	tsvc := ticketapp.NewService(tmem, ticketdomain.Crypto{Pepper: "pepper-value-32-chars-minimum-ok!", ActiveVersion: 1, Keys: map[int][]byte{1: key}}, ticketinfra.QRRenderer{})
	osvc.Issuer = tsvc
	osvc.Tickets = tsvc
	pmem := NewMemory()
	gw := payinfra.HMACSandbox{Secret: "sandbox-webhook-secret-32-chars-min"}
	svc := NewService(pmem, osvc, gw)
	svc.Now = func() time.Time { return now }
	svc.AllowDev = true
	svc.Guard = tsvc
	return svc, omem, pmem, osvc, now
}

func buyer() authdomain.User {
	return authdomain.User{ID: "u1", Role: authdomain.RoleUser, Status: authdomain.StatusActive}
}

func admin() authdomain.User {
	return authdomain.User{ID: "adm", Role: authdomain.RoleAdmin, Status: authdomain.StatusActive}
}

func createPending(t *testing.T, osvc *orderapp.Service) orderapp.OrderView {
	t.Helper()
	view, _, err := osvc.Create(context.Background(), buyer(), orderdomain.CheckoutInput{
		EventID: "evt1", Items: []orderdomain.LineInput{{
			TicketTypeID: "tt1", Quantity: 2,
			Attendees: []orderdomain.AttendeeInput{
				{FullName: "Pemegang Satu", Email: "a@example.com", Phone: "081234567890", IdentityNumber: "3174090000000001"},
				{FullName: "Pemegang Dua", Email: "b@example.com", Phone: "081234567891", IdentityNumber: "3174090000000002"},
			},
		}}, RedeemPoints: 200, Confirmed: true,
	}, "idempotency-key-pay-01", "")
	if err != nil {
		t.Fatal(err)
	}
	return view
}

func signSuccess(secret, ref string, amount int64, eventID string) ([]byte, map[string]string) {
	body := domain.MustJSON(map[string]any{
		"eventId": eventID, "eventType": domain.EventPaymentSucceeded,
		"externalReference": ref, "amountRupiah": amount, "currency": "IDR",
	})
	return body, map[string]string{"X-Sandbox-Signature": domain.SignBody(secret, body)}
}

func TestCreatePaymentAndWebhookPaid(t *testing.T) {
	svc, omem, _, osvc, _ := setupPay(t)
	ord := createPending(t, osvc)
	p, replay, err := svc.Create(context.Background(), buyer(), ord.ID, "QRIS", "idempotency-key-pay-02", "")
	if err != nil || replay || p.Status != domain.StatusPending || !p.Sandbox {
		t.Fatalf("create %#v %v", p, err)
	}
	p2, replay, err := svc.Create(context.Background(), buyer(), ord.ID, "QRIS", "idempotency-key-pay-03", "")
	if err != nil || !replay || p2.ID != p.ID {
		t.Fatalf("same payment %v %v %#v", replay, err, p2)
	}
	pay, _ := svc.Store.Get(context.Background(), p.ID)
	body, hdr := signSuccess("sandbox-webhook-secret-32-chars-min", *pay.ExternalReference, pay.AmountRupiah, "evt-ok-1")
	out := svc.ProcessWebhook(context.Background(), "sandbox", body, hdr)
	if out.Err != nil || out.HTTP != 200 {
		t.Fatalf("webhook %#v", out)
	}
	if omem.OrderSnapshot(ord.ID).Status != orderdomain.StatusPaid {
		t.Fatalf("status %s", omem.OrderSnapshot(ord.ID).Status)
	}
	if omem.Ticket("tt1").PaidQuantity != 2 || omem.Ticket("tt1").ReservedQuantity != 0 {
		t.Fatalf("counters %#v", omem.Ticket("tt1"))
	}
	earned := omem.OrderSnapshot(ord.ID).LoyaltyEarnedPoints
	if earned != omem.OrderSnapshot(ord.ID).TotalPayableRupiah/1000 {
		t.Fatalf("earn %d", earned)
	}
	out = svc.ProcessWebhook(context.Background(), "sandbox", body, hdr)
	if out.Err != nil || !out.Replay {
		t.Fatalf("replay %#v", out)
	}
	if omem.Ticket("tt1").PaidQuantity != 2 {
		t.Fatal("double paid")
	}
}

func TestWebhookInvalidSignature(t *testing.T) {
	svc, _, _, osvc, _ := setupPay(t)
	ord := createPending(t, osvc)
	p, _, err := svc.Create(context.Background(), buyer(), ord.ID, "VIRTUAL_ACCOUNT", "idempotency-key-pay-04", "")
	if err != nil {
		t.Fatal(err)
	}
	pay, _ := svc.Store.Get(context.Background(), p.ID)
	body := domain.MustJSON(map[string]any{
		"eventId": "bad", "eventType": domain.EventPaymentSucceeded,
		"externalReference": *pay.ExternalReference, "amountRupiah": pay.AmountRupiah, "currency": "IDR",
	})
	out := svc.ProcessWebhook(context.Background(), "sandbox", body, map[string]string{"X-Sandbox-Signature": "00"})
	if out.HTTP != 401 || !errors.Is(out.Err, domain.ErrSignatureInvalid) {
		t.Fatalf("%#v", out)
	}
}

func TestLateSuccessRecon(t *testing.T) {
	svc, omem, pmem, osvc, now := setupPay(t)
	ord := createPending(t, osvc)
	p, _, err := svc.Create(context.Background(), buyer(), ord.ID, "EWALLET", "idempotency-key-pay-05", "")
	if err != nil {
		t.Fatal(err)
	}
	late := now.Add(16 * time.Minute)
	svc.Now = func() time.Time { return late }
	osvc.Now = svc.Now
	pay, _ := svc.Store.Get(context.Background(), p.ID)
	body, hdr := signSuccess("sandbox-webhook-secret-32-chars-min", *pay.ExternalReference, pay.AmountRupiah, "evt-late-1")
	out := svc.ProcessWebhook(context.Background(), "sandbox", body, hdr)
	if out.Err != nil {
		t.Fatal(out.Err)
	}
	st := omem.OrderSnapshot(ord.ID).Status
	if st == orderdomain.StatusPaid {
		t.Fatal("late must not pay")
	}
	if pmem.OpenReconCount() != 1 {
		t.Fatalf("recon %d", pmem.OpenReconCount())
	}
}

func TestRefundCompletedLoyalty(t *testing.T) {
	svc, omem, _, osvc, _ := setupPay(t)
	ord := createPending(t, osvc)
	p, _, err := svc.Create(context.Background(), buyer(), ord.ID, "QRIS", "idempotency-key-pay-06", "")
	if err != nil {
		t.Fatal(err)
	}
	pay, _ := svc.Store.Get(context.Background(), p.ID)
	body, hdr := signSuccess("sandbox-webhook-secret-32-chars-min", *pay.ExternalReference, pay.AmountRupiah, "evt-ok-2")
	if out := svc.ProcessWebhook(context.Background(), "sandbox", body, hdr); out.Err != nil {
		t.Fatal(out.Err)
	}
	snap := omem.OrderSnapshot(ord.ID)
	partial := snap.TotalPayableRupiah / 2
	if partial <= 0 {
		partial = 1000
	}
	rf, _, err := svc.RequestRefund(context.Background(), admin(), ord.ID, partial, "Pengujian refund parsial sandbox", "idempotency-key-rf-01", "")
	if err != nil {
		t.Fatal(err)
	}
	dec, err := svc.DecideRefund(context.Background(), admin(), rf.ID, "APPROVE", "Setujui refund uji sandbox", 0)
	if err != nil {
		t.Fatal(err)
	}
	raw := domain.MustJSON(map[string]any{
		"eventId": "rf-1", "eventType": domain.EventRefundCompleted,
		"externalReference": *dec.ExternalReference, "amountRupiah": partial, "currency": "IDR",
	})
	out := svc.ProcessWebhook(context.Background(), "sandbox", raw, map[string]string{"X-Sandbox-Signature": domain.SignBody("sandbox-webhook-secret-32-chars-min", raw)})
	if out.Err != nil {
		t.Fatal(out.Err)
	}
	if omem.OrderSnapshot(ord.ID).Status != orderdomain.StatusPaid {
		t.Fatal("partial keeps paid")
	}
	rest := snap.TotalPayableRupiah - partial
	rf2, _, err := svc.RequestRefund(context.Background(), admin(), ord.ID, rest, "Pengujian refund penuh sandbox", "idempotency-key-rf-02", "")
	if err != nil {
		t.Fatal(err)
	}
	dec2, err := svc.DecideRefund(context.Background(), admin(), rf2.ID, "APPROVE", "Setujui refund penuh sandbox", 0)
	if err != nil {
		t.Fatal(err)
	}
	raw2 := domain.MustJSON(map[string]any{
		"eventId": "rf-2", "eventType": domain.EventRefundCompleted,
		"externalReference": *dec2.ExternalReference, "amountRupiah": rest, "currency": "IDR",
	})
	out = svc.ProcessWebhook(context.Background(), "sandbox", raw2, map[string]string{"X-Sandbox-Signature": domain.SignBody("sandbox-webhook-secret-32-chars-min", raw2)})
	if out.Err != nil {
		t.Fatal(out.Err)
	}
	if omem.OrderSnapshot(ord.ID).Status != orderdomain.StatusRefunded {
		t.Fatalf("full %s", omem.OrderSnapshot(ord.ID).Status)
	}
}

func TestEventCollision(t *testing.T) {
	svc, _, _, osvc, _ := setupPay(t)
	ord := createPending(t, osvc)
	p, _, _ := svc.Create(context.Background(), buyer(), ord.ID, "QRIS", "idempotency-key-pay-07", "")
	pay, _ := svc.Store.Get(context.Background(), p.ID)
	body, hdr := signSuccess("sandbox-webhook-secret-32-chars-min", *pay.ExternalReference, pay.AmountRupiah, "same-id")
	_ = svc.ProcessWebhook(context.Background(), "sandbox", body, hdr)
	body2 := domain.MustJSON(map[string]any{
		"eventId": "same-id", "eventType": domain.EventPaymentSucceeded,
		"externalReference": *pay.ExternalReference, "amountRupiah": pay.AmountRupiah + 1, "currency": "IDR",
	})
	out := svc.ProcessWebhook(context.Background(), "sandbox", body2, map[string]string{"X-Sandbox-Signature": domain.SignBody("sandbox-webhook-secret-32-chars-min", body2)})
	if out.HTTP != 409 || !errors.Is(out.Err, domain.ErrEventCollision) {
		t.Fatalf("%#v", out)
	}
}
