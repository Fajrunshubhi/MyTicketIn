package money

import "testing"

func TestFormatIDR(t *testing.T) {
	got, err := FormatIDR(125000)
	if err != nil {
		t.Fatal(err)
	}
	if got != "Rp125.000" {
		t.Fatalf("got %q", got)
	}
}

func TestFormatIDRRejectsNegative(t *testing.T) {
	if _, err := FormatIDR(-1); err == nil {
		t.Fatal("expected error")
	}
}
