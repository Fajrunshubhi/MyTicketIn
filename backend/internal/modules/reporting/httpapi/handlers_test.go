package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	authdomain "myticketin/internal/modules/auth/domain"
	reportapp "myticketin/internal/modules/reporting/application"
	"myticketin/internal/modules/reporting/domain"
)

func TestWriteErrSearchDisabled(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/admin/search", nil)
	writeErr(rec, req, domain.ErrSearchDisabled)
	if rec.Code != http.StatusNotFound {
		t.Fatal(rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "ADMIN_SEARCH_DISABLED") {
		t.Fatal(rec.Body.String())
	}
}

func TestRecommendModeBody(t *testing.T) {
	mem := reportapp.NewMemory()
	now := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	mem.DBNow = now
	mem.Current = domain.Candidate{ID: "cur", Slug: "now", Category: "Musik", City: "Jakarta", Province: "DKI", OrganizerID: "o1", OrganizerName: "Org", StartsAt: now.Add(time.Hour)}
	mem.Cands = []domain.Candidate{{ID: "a", Slug: "a", Title: "A", Category: "Musik", City: "Padang", Province: "Sumbar", OrganizerID: "x", OrganizerName: "X", StartsAt: now.Add(2 * time.Hour), Timezone: "Asia/Jakarta"}}
	svc := reportapp.NewService(mem, "cursor-secret-32-chars-minimum-ok")
	out, err := svc.Recommend(httptest.NewRequest(http.MethodGet, "/", nil).Context(), authdomain.User{}, false, "now", 6)
	if err != nil {
		t.Fatal(err)
	}
	if out["mode"] != "CONTEXTUAL" {
		t.Fatal(out)
	}
}
