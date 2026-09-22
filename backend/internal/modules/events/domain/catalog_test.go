package domain

import (
	"testing"
	"time"
)

func TestTicketSaleStatus(t *testing.T) {
	now := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	e := Event{Status: StatusPublished, StartsAt: now.Add(48 * time.Hour)}
	tt := TicketType{SaleStartsAt: now.Add(-time.Hour), SaleEndsAt: now.Add(24 * time.Hour)}
	if TicketSaleStatus(e, tt, now) != SaleAvailable {
		t.Fatal("available")
	}
	stopped := tt
	ts := now.Add(-time.Minute)
	stopped.SalesStoppedAt = &ts
	if TicketSaleStatus(e, stopped, now) != SaleStopped {
		t.Fatal("stopped")
	}
	notStarted := tt
	notStarted.SaleStartsAt = now.Add(time.Hour)
	if TicketSaleStatus(e, notStarted, now) != SaleNotStarted {
		t.Fatal("not started")
	}
	endedSale := tt
	endedSale.SaleEndsAt = now.Add(-time.Minute)
	if TicketSaleStatus(e, endedSale, now) != SaleEnded {
		t.Fatal("sale ended")
	}
	startedEvent := e
	startedEvent.StartsAt = now.Add(-time.Minute)
	if TicketSaleStatus(startedEvent, tt, now) != SaleEnded {
		t.Fatal("event started")
	}
	draft := e
	draft.Status = StatusDraft
	if TicketSaleStatus(draft, tt, now) != SaleStopped {
		t.Fatal("draft")
	}
}

func TestNormalizeCatalogQuery(t *testing.T) {
	q, err := NormalizeCatalogQuery(CatalogQuery{Q: "  Festival   Musik  ", Limit: 12})
	if err != nil || q.Q != "Festival Musik" || q.Sort != SortSoonest {
		t.Fatalf("%+v %v", q, err)
	}
	if _, err := NormalizeCatalogQuery(CatalogQuery{Q: string(make([]rune, 101))}); err != ErrCatalogQueryInvalid {
		t.Fatal(err)
	}
	if _, err := NormalizeCatalogQuery(CatalogQuery{DateFrom: "2026-01-02", DateTo: "2026-01-01"}); err != ErrCatalogDateRange {
		t.Fatal(err)
	}
	oneDay, err := NormalizeCatalogQuery(CatalogQuery{DateFrom: "2026-01-02"})
	if err != nil || oneDay.DateTo != "2026-01-02" {
		t.Fatalf("dateFrom-only %+v %v", oneDay, err)
	}
	if _, err := NormalizeCatalogQuery(CatalogQuery{Sort: "price"}); err != ErrCatalogQueryInvalid {
		t.Fatal(err)
	}
	tagQ, err := NormalizeCatalogQuery(CatalogQuery{Tag: "Jakarta Events"})
	if err != nil || tagQ.Tag != "jakarta-events" {
		t.Fatalf("%+v %v", tagQ, err)
	}
	if _, err := NormalizeCatalogQuery(CatalogQuery{Tag: "x"}); err != ErrCatalogQueryInvalid {
		t.Fatal(err)
	}
}

func TestNormalizeNaturalLanguage(t *testing.T) {
	if _, err := NormalizeNaturalLanguage("x"); err != ErrCatalogNaturalInvalid {
		t.Fatal(err)
	}
	got, err := NormalizeNaturalLanguage("  konser   jazz  ")
	if err != nil || got != "konser jazz" {
		t.Fatalf("%q %v", got, err)
	}
}
