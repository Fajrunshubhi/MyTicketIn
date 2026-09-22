package domain

import (
	"strings"
	"testing"
)

func TestNormalizeAndClassify(t *testing.T) {
	payload := strings.Repeat("A", 43)
	tok := "ti1_" + payload
	if len(tok) != 47 {
		t.Fatalf("len %d", len(tok))
	}
	n, ok := Normalize(Input{Type: InputQR, Raw: tok})
	if !ok || n != tok {
		t.Fatal(n, ok)
	}
	_, ok = Normalize(Input{Type: InputQR, Raw: "not-a-token"})
	if ok {
		t.Fatal("format")
	}
	n, ok = Normalize(Input{Type: InputManual, Raw: "abcd-1234-wxyz-9876"})
	if !ok || n != "ABCD1234WXYZ9876" {
		t.Fatal(n, ok)
	}
	res, reason := Classify(nil, "e1", "PUBLISHED")
	if res != ResultInvalid || reason != ReasonUnknown {
		t.Fatal(res, reason)
	}
	res, reason = Classify(&TicketView{EventID: "other", Status: "UNUSED", OrderStatus: "PAID"}, "e1", "PUBLISHED")
	if res != ResultWrongEvent {
		t.Fatal(res, reason)
	}
	res, reason = Classify(&TicketView{EventID: "e1", Status: "CANCELLED", OrderStatus: "PAID"}, "e1", "PUBLISHED")
	if res != ResultCancelled {
		t.Fatal(res)
	}
	res, reason = Classify(&TicketView{EventID: "e1", Status: "USED", OrderStatus: "PAID"}, "e1", "PUBLISHED")
	if res != ResultAlreadyUsed {
		t.Fatal(res)
	}
	res, reason = Classify(&TicketView{EventID: "e1", Status: "UNUSED", OrderStatus: "PAID"}, "e1", "CANCELLED")
	if res != ResultInvalid || reason != ReasonEventCancel {
		t.Fatal(res, reason)
	}
	res, reason = Classify(&TicketView{EventID: "e1", Status: "UNUSED", OrderStatus: "PENDING"}, "e1", "PUBLISHED")
	if res != ResultInvalid || reason != ReasonOrderNotPaid {
		t.Fatal(res, reason)
	}
	res, reason = Classify(&TicketView{EventID: "e1", Status: "UNUSED", OrderStatus: "PAID"}, "e1", "PUBLISHED")
	if res != ResultValid {
		t.Fatal(res, reason)
	}
	if MaskNumber("TIX-ABCDEFGHIJ") != "TIX-ABC*******" {
		t.Fatal(MaskNumber("TIX-ABCDEFGHIJ"))
	}
}
