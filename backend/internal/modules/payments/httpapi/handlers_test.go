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
	payapp "myticketin/internal/modules/payments/application"
	"myticketin/internal/modules/payments/domain"
	payinfra "myticketin/internal/modules/payments/infrastructure"
	"myticketin/internal/platform/env"
	"myticketin/internal/platform/httpx"
)

func TestWebhookUnauthorizedWithoutSignature(t *testing.T) {
	users := authapp.NewMemory()
	h := authapp.StaticHasher{
		HashFn:    func(p string) (string, error) { return "h:" + p, nil },
		CompareFn: func(hash, password string) bool { return hash == "h:"+password },
	}
	authSvc := authapp.NewService(users, users, users, h)
	omem := orderapp.NewMemory()
	now := time.Date(2026, 9, 22, 5, 0, 0, 0, time.UTC)
	omem.PutEvent(eventdomain.Event{
		ID: "evt1", OrganizerProfileID: "org1", Slug: "x", Title: "X", Status: eventdomain.StatusPublished,
		InventoryMode: eventdomain.ModeGA, StartsAt: now.Add(48 * time.Hour), EndsAt: now.Add(50 * time.Hour),
	}, []eventdomain.TicketType{{
		ID: "tt1", EventID: "evt1", Name: "Reg", PriceRupiah: 1000, Quota: 5, MaxPerAccount: 5,
		SaleStartsAt: now.Add(-time.Hour), SaleEndsAt: now.Add(24 * time.Hour),
	}}, nil, nil)
	osvc := orderapp.NewService(omem)
	osvc.Now = func() time.Time { return now }
	pmem := payapp.NewMemory()
	psvc := payapp.NewService(pmem, osvc, payinfra.HMACSandbox{Secret: "sandbox-webhook-secret-32-chars-min"})
	psvc.Now = osvc.Now
	authAPI := authhttp.API{Cfg: env.Config{AppEnv: "test", WebOrigin: "http://localhost:3000", SessionSecret: "test-session-secret-32-chars-long"}, Svc: authSvc}
	api := API{Auth: authAPI, Svc: psvc}
	handler := httpx.NewRouter(authAPI.Cfg, slog.New(slog.NewTextHandler(io.Discard, nil)), nil, func(r chi.Router) {
		authAPI.Mount(r)
		api.Mount(r)
	})
	req := httptest.NewRequest(http.MethodPost, "/api/webhooks/payments/sandbox", strings.NewReader(`{"eventId":"e","eventType":"payment.succeeded","externalReference":"x","amountRupiah":1,"currency":"IDR"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("sig %d %s", rec.Code, rec.Body.String())
	}
	raw := domain.MustJSON(map[string]any{"eventId": "e2", "eventType": "unknown.event", "externalReference": "x", "amountRupiah": 1, "currency": "IDR"})
	req = httptest.NewRequest(http.MethodPost, "/api/webhooks/payments/sandbox", strings.NewReader(string(raw)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Sandbox-Signature", domain.SignBody("sandbox-webhook-secret-32-chars-min", raw))
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("unknown %d %s", rec.Code, rec.Body.String())
	}
}
