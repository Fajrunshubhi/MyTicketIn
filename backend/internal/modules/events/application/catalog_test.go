package application

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"myticketin/internal/modules/events/domain"
)

type failLimiter struct{ err error }

func (f failLimiter) Hit(context.Context, string, string, time.Duration) (int, error) {
	return 0, f.err
}

type catalogCap struct{ id string }

func (s catalogCap) RequireApprovedOrganizer(context.Context, string) (string, error) {
	return s.id, nil
}

func TestListPublicEventsOnlyPublishedFuture(t *testing.T) {
	mem := NewMemory()
	now := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	svc := NewService(mem, catalogCap{id: "org1"})
	svc.Now = func() time.Time { return now }
	future := now.Add(48 * time.Hour)
	mustCreate(t, mem, domain.Event{ID: "pub", OrganizerProfileID: "org1", Slug: "festival-musik", Title: "Festival Musik", Category: "Musik", City: "Bandung", Province: "Jawa Barat", Timezone: "Asia/Jakarta", Status: domain.StatusPublished, StartsAt: future, EndsAt: future.Add(3 * time.Hour), GalleryURLs: []string{"https://cdn.example/a.jpg", "https://cdn.example/b.jpg"}})
	mustCreate(t, mem, domain.Event{ID: "draft", OrganizerProfileID: "org1", Slug: "draf-rahasia", Title: "Draf Rahasia", Category: "Musik", City: "Bandung", Province: "Jawa Barat", Timezone: "Asia/Jakarta", Status: domain.StatusDraft, StartsAt: future, EndsAt: future.Add(time.Hour)})
	mustCreate(t, mem, domain.Event{ID: "past", OrganizerProfileID: "org1", Slug: "sudah-lewat", Title: "Sudah Lewat", Category: "Musik", City: "Bandung", Province: "Jawa Barat", Timezone: "Asia/Jakarta", Status: domain.StatusPublished, StartsAt: now.Add(-2 * time.Hour), EndsAt: now.Add(-time.Hour)})
	items, _, _, err := svc.ListPublicEvents(context.Background(), domain.CatalogQuery{}, "10.0.0.1", "secret-secret-secret-secret-32ch")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].Slug != "festival-musik" {
		t.Fatalf("%+v", items)
	}
	if items[0].Image.URL != "https://cdn.example/a.jpg" {
		t.Fatalf("list cover %s", items[0].Image.URL)
	}
	detail, err := svc.GetPublicEvent(context.Background(), "festival-musik", "10.0.0.1")
	if err != nil || len(detail.Images) != 2 || detail.Image.URL != "https://cdn.example/a.jpg" {
		t.Fatalf("gallery %+v %v", detail.Images, err)
	}
	_, err = svc.GetPublicEvent(context.Background(), "draf-rahasia", "10.0.0.1")
	if err != domain.ErrNotFound {
		t.Fatalf("draft detail %v", err)
	}
	tagged := domain.Event{ID: "tagged", OrganizerProfileID: "org1", Slug: "konser-jazz", Title: "Konser Jazz", Category: "Musik", City: "Bandung", Province: "Jawa Barat", Timezone: "Asia/Jakarta", Status: domain.StatusPublished, StartsAt: future, EndsAt: future.Add(3 * time.Hour), Tags: []string{"jakarta-events", "jazz"}}
	mustCreate(t, mem, tagged)
	byTag, _, _, err := svc.ListPublicEvents(context.Background(), domain.CatalogQuery{Tag: "jazz"}, "10.0.0.1", "secret-secret-secret-secret-32ch")
	if err != nil || len(byTag) != 1 || byTag[0].Slug != "konser-jazz" {
		t.Fatalf("tag filter %+v %v", byTag, err)
	}
	if byTag[0].Image.URL != "/dummy-events/jazz-1.jpg" {
		t.Fatalf("empty gallery cover %s", byTag[0].Image.URL)
	}
}

func TestListPublicEventsIgnoresLimiterOutage(t *testing.T) {
	mem := NewMemory()
	now := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	svc := NewService(mem, catalogCap{id: "org1"})
	svc.Now = func() time.Time { return now }
	svc.Rates = failLimiter{err: errors.New("rate store down")}
	svc.HashKey = func(raw string) string { return raw }
	future := now.Add(48 * time.Hour)
	mustCreate(t, mem, domain.Event{ID: "pub", OrganizerProfileID: "org1", Slug: "festival-musik", Title: "Festival Musik", Category: "Musik", City: "Bandung", Province: "Jawa Barat", Timezone: "Asia/Jakarta", Status: domain.StatusPublished, StartsAt: future, EndsAt: future.Add(3 * time.Hour)})
	items, _, _, err := svc.ListPublicEvents(context.Background(), domain.CatalogQuery{}, "10.0.0.1", "secret-secret-secret-secret-32ch")
	if err != nil || len(items) != 1 {
		t.Fatalf("%+v %v", items, err)
	}
}

func TestParseNaturalFilterFallbackAndReject(t *testing.T) {
	mem := NewMemory()
	svc := NewService(mem, catalogCap{})
	svc.Now = func() time.Time { return time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC) }
	svc.CatalogAI = FakeCatalogAI{}
	out, err := svc.ParseNaturalFilter(context.Background(), "SELECT * FROM events WHERE status=DRAFT", "10.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	if out.Mode != "BASIC_SEARCH_FALLBACK" || !strings.Contains(out.Notice, "kata kunci") {
		t.Fatalf("%+v", out)
	}
	_, err = svc.ParseNaturalFilter(context.Background(), "x", "10.0.0.1")
	if err != domain.ErrCatalogNaturalInvalid {
		t.Fatalf("%v", err)
	}
}

func TestCatalogCursorBoundToFilters(t *testing.T) {
	q, _ := domain.NormalizeCatalogQuery(domain.CatalogQuery{Category: "musik", Sort: domain.SortSoonest})
	tok := EncodeCatalogCursor("s", q, time.Now().UTC(), "id1")
	q2 := q
	q2.Category = "olahraga"
	if _, _, err := DecodeCatalogCursor("s", q2, tok); err != domain.ErrCatalogCursorInvalid {
		t.Fatalf("%v", err)
	}
}

func mustCreate(t *testing.T, mem *Memory, e domain.Event) {
	t.Helper()
	if err := mem.CreateEvent(context.Background(), e); err != nil {
		t.Fatal(err)
	}
}
