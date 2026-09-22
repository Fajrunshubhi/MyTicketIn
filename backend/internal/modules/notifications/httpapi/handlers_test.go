package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"myticketin/internal/modules/notifications/domain"
)

func TestJobUnauthorized(t *testing.T) {
	api := API{SchedulerSecret: "scheduler-secret-32-chars-minimum-ok"}
	r := chi.NewRouter()
	r.Post("/api/internal/jobs/dispatch-notifications", api.dispatch)
	r.Post("/api/internal/jobs/send-event-reminders", api.reminders)
	for _, path := range []string{"/api/internal/jobs/dispatch-notifications", "/api/internal/jobs/send-event-reminders"} {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, path, nil)
		r.ServeHTTP(rr, req)
		if rr.Code != http.StatusUnauthorized {
			t.Fatal(path, rr.Code, rr.Body.String())
		}
	}
}

func TestWriteErrJobUnauthorizedJSON(t *testing.T) {
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/internal/jobs/dispatch-notifications", nil)
	writeErr(rr, req, domain.ErrJobUnauthorized)
	if rr.Code != http.StatusUnauthorized {
		t.Fatal(rr.Code)
	}
	if ct := rr.Header().Get("Content-Type"); ct == "" {
		t.Fatal("missing content type")
	}
}
