package clock

import (
	"strings"
	"testing"
	"time"
)

func TestFormatInZoneUsesJakarta(t *testing.T) {
	utc := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	got, err := FormatInZone(utc, "Asia/Jakarta")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(got, "07:00") {
		t.Fatalf("expected 07:00 WIB, got %q", got)
	}
	if !strings.Contains(got, "WIB") && !strings.Contains(got, "GMT+7") && !strings.Contains(got, "+0700") {
		t.Fatalf("expected named zone, got %q", got)
	}
}
