package domain

import "testing"

func TestCanonicalHashStableAndSensitive(t *testing.T) {
	a := CheckoutInput{EventID: "e1", Items: []LineInput{{TicketTypeID: "b", Quantity: 1}, {TicketTypeID: "a", Quantity: 2}}, RedeemPoints: 3}
	b := CheckoutInput{EventID: "e1", Items: []LineInput{{TicketTypeID: "a", Quantity: 2}, {TicketTypeID: "b", Quantity: 1}}, RedeemPoints: 3}
	ha, err := CanonicalHash(a)
	if err != nil {
		t.Fatal(err)
	}
	hb, err := CanonicalHash(b)
	if err != nil || ha != hb {
		t.Fatalf("%s %s %v", ha, hb, err)
	}
	c := a
	c.RedeemPoints = 4
	hc, _ := CanonicalHash(c)
	if hc == ha {
		t.Fatal("redeem must change hash")
	}
}

func TestNormalizeRejectsBadQty(t *testing.T) {
	_, err := NormalizeCheckout(CheckoutInput{EventID: "e", Items: []LineInput{{TicketTypeID: "t", Quantity: 10001}}})
	if err != ErrCheckoutInvalid {
		t.Fatal(err)
	}
}

func TestIdempotencyKey(t *testing.T) {
	if ValidateIdempotencyKey("short") != ErrKeyRequired {
		t.Fatal("short")
	}
	if err := ValidateIdempotencyKey("1234567890abcdef"); err != nil {
		t.Fatal(err)
	}
}

func TestRemainingStock(t *testing.T) {
	if Remaining(10, 3, 7) != 0 || StockLabel(0, 10) != "SOLD_OUT" {
		t.Fatal("sold out")
	}
	if StockLabel(4, 100) != "LOW" {
		t.Fatal("low")
	}
}
