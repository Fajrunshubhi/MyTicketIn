package httpapi

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	ticketdomain "myticketin/internal/modules/tickets/domain"
)

func TestWriteErrQRUnavailableIsJSON(t *testing.T) {
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/tickets/x/qr", nil)
	writeErr(rr, req.WithContext(req.Context()), ticketdomain.ErrQRUnavailable)
	if rr.Code != http.StatusConflict {
		t.Fatal(rr.Code)
	}
	if ct := rr.Header().Get("Content-Type"); ct == "image/png" {
		t.Fatal(ct)
	}
	body, _ := io.ReadAll(rr.Body)
	if len(body) == 0 {
		t.Fatal("empty")
	}
}

func TestJobUnauthorized(t *testing.T) {
	api := API{SchedulerSecret: "scheduler-secret-32-chars-minimum-ok"}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/internal/jobs/reconcile-ticket-issuance", nil)
	r := chi.NewRouter()
	r.Post("/api/internal/jobs/reconcile-ticket-issuance", api.reconcile)
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatal(rr.Code, rr.Body.String())
	}
}
