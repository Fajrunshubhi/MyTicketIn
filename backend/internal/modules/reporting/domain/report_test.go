package domain

import (
	"testing"
	"time"
)

func TestScoreHistoryAndReason(t *testing.T) {
	sig := Signal{
		Category:  map[string]int{"Musik": 9},
		City:      map[string]int{"Jakarta": 2},
		Province:  map[string]int{"DKI": 1},
		Organizer: map[string]int{"org1": 1},
	}
	c := Candidate{Category: "Musik", City: "Jakarta", Province: "DKI", OrganizerID: "org1"}
	score, reason := ScoreHistory(c, sig)
	if score != 3*5+2*2+1+1 {
		t.Fatalf("score %d", score)
	}
	if reason != "Kategori serupa" {
		t.Fatal(reason)
	}
	c.Category = "Olahraga"
	score, reason = ScoreHistory(c, sig)
	if score != 2*2+1+1 || reason != "Lokasi serupa" {
		t.Fatal(score, reason)
	}
}

func TestCSVAndMask(t *testing.T) {
	if CSVCell("=cmd") != `"'=cmd"` {
		t.Fatal(CSVCell("=cmd"))
	}
	if MaskName("Ada") != "A**" {
		t.Fatal(MaskName("Ada"))
	}
	if MaskEmail("ada@example.test") != "a***@example.test" {
		t.Fatal(MaskEmail("ada@example.test"))
	}
}

func TestParseRange(t *testing.T) {
	if _, err := ParseRange("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z", time.Now().UTC()); err == nil {
		t.Fatal("equal")
	}
}
