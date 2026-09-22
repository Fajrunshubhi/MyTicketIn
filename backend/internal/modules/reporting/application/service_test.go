package application

import (
	"context"
	"testing"
	"time"

	authdomain "myticketin/internal/modules/auth/domain"
	"myticketin/internal/modules/reporting/domain"
)

func TestRecommendHistoryExcludesPurchased(t *testing.T) {
	mem := NewMemory()
	now := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	mem.DBNow = now
	mem.Current = domain.Candidate{ID: "cur", Slug: "now", Category: "Musik", City: "Jakarta", Province: "DKI", OrganizerID: "org1", OrganizerName: "Org", StartsAt: now.Add(time.Hour)}
	mem.Cands = []domain.Candidate{
		{ID: "a", Slug: "a", Title: "A", Category: "Musik", City: "Bandung", Province: "Jabar", OrganizerID: "org2", OrganizerName: "X", StartsAt: now.Add(2 * time.Hour), Timezone: "Asia/Jakarta"},
		{ID: "b", Slug: "b", Title: "B", Category: "Musik", City: "Jakarta", Province: "DKI", OrganizerID: "org1", OrganizerName: "Org", StartsAt: now.Add(3 * time.Hour), Timezone: "Asia/Jakarta"},
		{ID: "bought", Slug: "c", Title: "C", Category: "Musik", City: "Jakarta", Province: "DKI", OrganizerID: "org1", OrganizerName: "Org", StartsAt: now.Add(4 * time.Hour), Timezone: "Asia/Jakarta"},
	}
	mem.Signals["u1"] = domain.Signal{
		Category:  map[string]int{"Musik": 2},
		City:      map[string]int{"Jakarta": 2},
		Province:  map[string]int{"DKI": 2},
		Organizer: map[string]int{"org1": 2},
		Purchased: map[string]struct{}{"bought": {}, "cur": {}},
	}
	svc := NewService(mem, "cursor-secret-32-chars-minimum-ok")
	out, err := svc.Recommend(context.Background(), authdomain.User{ID: "u1", Status: authdomain.StatusActive}, true, "now", 6)
	if err != nil {
		t.Fatal(err)
	}
	if out["mode"] != "HISTORY" {
		t.Fatal(out["mode"])
	}
	items := out["items"].([]map[string]any)
	for _, it := range items {
		if it["slug"] == "c" || it["slug"] == "now" {
			t.Fatal(it)
		}
		if _, ok := it["score"]; ok {
			t.Fatal("score leaked")
		}
	}
	if len(items) == 0 {
		t.Fatal("expected candidates")
	}
}

func TestDashboardOwnerOnly(t *testing.T) {
	mem := NewMemory()
	mem.OrgID = "org1"
	mem.OwnerID = "owner"
	mem.Events["e1"] = domain.EventRow{ID: "e1", Title: "Konser"}
	mem.Summary = domain.Summary{PaidOrderCount: 2, TicketsSold: 4, GrossSandboxRupiah: 400000, CheckInCount: 1}
	svc := NewService(mem, "cursor-secret-32-chars-minimum-ok")
	out, err := svc.Dashboard(context.Background(), authdomain.User{ID: "owner", Role: authdomain.RoleUser, Status: authdomain.StatusActive}, "", "", "", "", 20)
	if err != nil {
		t.Fatal(err)
	}
	sum := out["summary"].(domain.Summary)
	if sum.PaidOrderCount != 2 || sum.AttendanceRate == nil {
		t.Fatalf("%#v", sum)
	}
	charts := out["charts"].(map[string]any)
	evs := charts["events"].([]domain.SalesBar)
	if len(evs) != 1 || evs[0].Label != "Konser" || evs[0].TicketsSold != 0 {
		t.Fatalf("%#v", charts["events"])
	}
	if _, err := svc.Dashboard(context.Background(), authdomain.User{ID: "other", Role: authdomain.RoleUser, Status: authdomain.StatusActive}, "", "", "", "", 20); err != domain.ErrOrganizerRequired {
		t.Fatal(err)
	}
}

func TestTrendAndSearchDisabled(t *testing.T) {
	mem := NewMemory()
	mem.OrgID = "org1"
	mem.OwnerID = "owner"
	mem.Events["e1"] = domain.EventRow{ID: "e1"}
	svc := NewService(mem, "cursor-secret-32-chars-minimum-ok")
	actor := authdomain.User{ID: "owner", Role: authdomain.RoleUser, Status: authdomain.StatusActive}
	if _, err := svc.Trend(context.Background(), actor, "e1", "2026-01-01T00:00:00Z", "2026-01-08T00:00:00Z", "day"); err != domain.ErrTrendDisabled {
		t.Fatal(err)
	}
	admin := authdomain.User{ID: "a", Role: authdomain.RoleAdmin, Status: authdomain.StatusActive}
	if _, err := svc.Search(context.Background(), admin, "abc", "user"); err != domain.ErrSearchDisabled {
		t.Fatal(err)
	}
}

func TestRecommendContextualAnonymous(t *testing.T) {
	mem := NewMemory()
	now := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	mem.DBNow = now
	mem.Current = domain.Candidate{ID: "cur", Slug: "now", Category: "Musik", City: "Jakarta", Province: "DKI", OrganizerID: "org1", OrganizerName: "Org", StartsAt: now.Add(time.Hour)}
	mem.Cands = []domain.Candidate{
		{ID: "a", Slug: "a", Title: "A", Category: "Musik", City: "Medan", Province: "Sumut", OrganizerID: "org9", OrganizerName: "Y", StartsAt: now.Add(2 * time.Hour), Timezone: "Asia/Jakarta"},
	}
	svc := NewService(mem, "cursor-secret-32-chars-minimum-ok")
	out, err := svc.Recommend(context.Background(), authdomain.User{}, false, "now", 6)
	if err != nil {
		t.Fatal(err)
	}
	if out["mode"] != "CONTEXTUAL" {
		t.Fatal(out["mode"])
	}
}
