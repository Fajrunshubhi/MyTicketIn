package application

import (
	"testing"
	"time"

	"myticketin/internal/modules/events/domain"
)

func TestNormalizeEventRejectsShortTitleAndBadTZ(t *testing.T) {
	now := time.Date(2026, 10, 1, 8, 0, 0, 0, time.UTC)
	in := sampleInput(now)
	in.Title = "ab"
	in.Timezone = "UTC"
	if _, err := NormalizeEvent(in); err == nil {
		t.Fatal("expected validation")
	}
	ok := sampleInput(now)
	got, err := NormalizeEvent(ok)
	if err != nil || len(got.Tags) != 2 || got.Tags[0] != "jakarta-events" {
		t.Fatalf("%+v %v", got, err)
	}
	missing := sampleInput(now)
	missing.Latitude = nil
	if _, err := NormalizeEvent(missing); err == nil {
		t.Fatal("coords required")
	}
	ok.GalleryURLs = []string{"https://cdn.example/a.jpg", "https://cdn.example/a.jpg", "javascript:alert(1)"}
	if _, err := NormalizeEvent(ok); err == nil {
		t.Fatal("bad gallery")
	}
	ok = sampleInput(now)
	ok.GalleryURLs = []string{"https://cdn.example/a.jpg", "https://cdn.example/b.jpg"}
	got, err = NormalizeEvent(ok)
	if err != nil || len(got.GalleryURLs) != 2 {
		t.Fatalf("gallery %+v %v", got.GalleryURLs, err)
	}
	ok = sampleInput(now)
	ok.GalleryURLs = []string{"/dummy-events/jazz-1.jpg", "/etc/passwd", "/uploads/gallery/not-hex.jpg"}
	if _, err := NormalizeEvent(ok); err == nil {
		t.Fatal("unsafe local gallery")
	}
	ok = sampleInput(now)
	ok.GalleryURLs = []string{"/dummy-events/jazz-1.jpg", "/uploads/gallery/0123456789abcdef0123456789abcdef.jpg"}
	got, err = NormalizeEvent(ok)
	if err != nil || len(got.GalleryURLs) != 2 {
		t.Fatalf("local gallery %+v %v", got.GalleryURLs, err)
	}
}

func TestSlugifyStableLowercase(t *testing.T) {
	got := Slugify("Konser Kota Tua!", "abc12")
	if got != "konser-kota-tua-abc12" {
		t.Fatalf("%s", got)
	}
}

func TestNormalizeTicketFreeAllowed(t *testing.T) {
	now := time.Date(2026, 10, 1, 8, 0, 0, 0, time.UTC)
	got, err := NormalizeTicket(TicketInput{
		Name: "Gratis", PriceRupiah: 0, Quota: 10, MaxPerAccount: 1,
		SaleStartsAt: now, SaleEndsAt: now.Add(time.Hour),
	})
	if err != nil || got.PriceRupiah != 0 {
		t.Fatalf("%v %+v", err, got)
	}
	_ = domain.ModeGA
}
