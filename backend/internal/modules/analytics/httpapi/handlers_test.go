package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	analyticsapp "myticketin/internal/modules/analytics/application"
	"myticketin/internal/modules/analytics/domain"
	authapp "myticketin/internal/modules/auth/application"
	authhttp "myticketin/internal/modules/auth/httpapi"
	"myticketin/internal/platform/env"
	"myticketin/internal/platform/httpx"
)

type memA struct {
	events []domain.Event
}

func (m *memA) Insert(_ context.Context, ev domain.Event) (bool, error) {
	m.events = append(m.events, ev)
	return true, nil
}

func TestClientAnalyticsIgnoresForgedActor(t *testing.T) {
	mem := authapp.NewMemory()
	hsh := authapp.StaticHasher{
		HashFn:    func(p string) (string, error) { return "h:" + p, nil },
		CompareFn: func(hash, password string) bool { return hash == "h:"+password },
	}
	svc := authapp.NewService(mem, mem, mem, hsh)
	authAPI := authhttp.API{Cfg: env.Config{AppEnv: "test", WebOrigin: "http://localhost:3000", SessionSecret: "test-session-secret-32-chars-long"}, Svc: svc}
	store := &memA{}
	em := &analyticsapp.Emitter{Store: store, Metrics: &analyticsapp.Metrics{}}
	anal := API{Auth: authAPI, Emit: em, Rates: mem}
	handler := httpx.NewRouter(authAPI.Cfg, slog.New(slog.NewTextHandler(io.Discard, nil)), nil, func(r chi.Router) {
		authAPI.Mount(r)
		anal.Mount(r)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/auth/csrf", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	var csrfBody map[string]string
	_ = json.Unmarshal(rec.Body.Bytes(), &csrfBody)
	cookies := rec.Result().Cookies()

	req = httptest.NewRequest(http.MethodPost, "/api/analytics/events", strings.NewReader(`{"eventName":"ticket_viewed","schemaVersion":1,"properties":{"source":"web","entityType":"Ticket","entityId":"t1"},"actorUserId":"forged-user"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", csrfBody["csrfToken"])
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	if len(store.events) != 1 || store.events[0].ActorUserID != nil {
		t.Fatalf("forged actor leaked: %+v", store.events)
	}
	req = httptest.NewRequest(http.MethodPost, "/api/analytics/events", strings.NewReader(`{"eventName":"user_registered","schemaVersion":1,"properties":{"source":"web"}}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", csrfBody["csrfToken"])
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("server event from client %d %s", rec.Code, rec.Body.String())
	}
}
