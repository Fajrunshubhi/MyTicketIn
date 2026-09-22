package domain

import "testing"

func TestParseMethodAndMapEvent(t *testing.T) {
	m, err := ParseMethod("qris")
	if err != nil || m != MethodQRIS {
		t.Fatal(m, err)
	}
	if _, err := ParseMethod("CARD"); err != ErrMethodUnavailable {
		t.Fatal(err)
	}
	st, refund, ok := MapEvent(EventPaymentSucceeded)
	if !ok || refund || st != StatusSucceeded {
		t.Fatal(st)
	}
	_, refund, ok = MapEvent(EventRefundCompleted)
	if !ok || !refund {
		t.Fatal("refund event")
	}
	if _, _, ok := MapEvent("unknown"); ok {
		t.Fatal("unknown")
	}
}

func TestSignatureRoundTrip(t *testing.T) {
	raw := []byte(`{"eventId":"e1"}`)
	sig := SignBody("secret-value-32-chars-minimum-ok", raw)
	if !SignatureOK("secret-value-32-chars-minimum-ok", sig, raw) {
		t.Fatal("sig")
	}
	if SignatureOK("secret-value-32-chars-minimum-ok", sig, []byte("{}")) {
		t.Fatal("mismatch")
	}
}
