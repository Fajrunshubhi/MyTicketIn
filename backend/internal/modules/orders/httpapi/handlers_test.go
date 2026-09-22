package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	authapp "myticketin/internal/modules/auth/application"
	authhttp "myticketin/internal/modules/auth/httpapi"
	eventdomain "myticketin/internal/modules/events/domain"
	orderapp "myticketin/internal/modules/orders/application"
	"myticketin/internal/platform/env"
	"myticketin/internal/platform/httpx"
)

func TestExpireUnauthorizedAndCheckoutRequiresAuth(t *testing.T) {
	users := authapp.NewMemory()
	h := authapp.StaticHasher{
		HashFn:    func(p string) (string, error) { return "h:" + p, nil },
		CompareFn: func(hash, password string) bool { return hash == "h:"+password },
	}
	authSvc := authapp.NewService(users, users, users, h)
	mem := orderapp.NewMemory()
	now := time.Date(2026, 9, 22, 5, 0, 0, 0, time.UTC)
	mem.PutEvent(eventdomain.Event{
		ID: "evt1", OrganizerProfileID: "org1", Slug: "x", Title: "X", Status: eventdomain.StatusPublished,
		InventoryMode: eventdomain.ModeGA, StartsAt: now.Add(48 * time.Hour), EndsAt: now.Add(50 * time.Hour),
	}, []eventdomain.TicketType{{
		ID: "tt1", EventID: "evt1", Name: "Reg", PriceRupiah: 1000, Quota: 5, MaxPerAccount: 5,
		SaleStartsAt: now.Add(-time.Hour), SaleEndsAt: now.Add(24 * time.Hour),
	}}, nil, nil)
	svc := orderapp.NewService(mem)
	svc.Now = func() time.Time { return now }
	authAPI := authhttp.API{Cfg: env.Config{AppEnv: "test", WebOrigin: "http://localhost:3000", SessionSecret: "test-session-secret-32-chars-long"}, Svc: authSvc}
	api := API{Auth: authAPI, Svc: svc, SchedulerSecret: "scheduler-secret-value-32-chars"}
	handler := httpx.NewRouter(authAPI.Cfg, slog.New(slog.NewTextHandler(io.Discard, nil)), nil, func(r chi.Router) {
		authAPI.Mount(r)
		api.Mount(r)
	})

	req := httptest.NewRequest(http.MethodPost, "/api/internal/jobs/expire-orders", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("job %d", rec.Code)
	}
	req = httptest.NewRequest(http.MethodPost, "/api/internal/jobs/expire-orders", strings.NewReader(`{"batchSize":10}`))
	req.Header.Set("X-Scheduler-Secret", "scheduler-secret-value-32-chars")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("job ok %d %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/checkout/summary", strings.NewReader(`{"eventId":"evt1","items":[{"ticketTypeId":"tt1","quantity":1}]}`))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("summary auth %d", rec.Code)
	}
}
