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
	"time"

	"github.com/go-chi/chi/v5"

	auditapp "myticketin/internal/modules/audit/application"
	"myticketin/internal/modules/audit/domain"
	authapp "myticketin/internal/modules/auth/application"
	authhttp "myticketin/internal/modules/auth/httpapi"
	"myticketin/internal/platform/env"
	"myticketin/internal/platform/httpx"
)

type memAudit struct {
	rows []domain.Detail
}

func (m *memAudit) Insert(context.Context, domain.Record) error { return nil }

func (m *memAudit) Get(_ context.Context, id string) (domain.Detail, error) {
	for _, r := range m.rows {
		if r.ID == id {
			return r, nil
		}
	}
	return domain.Detail{}, context.Canceled
}

func (m *memAudit) List(context.Context, domain.Filter) ([]domain.Summary, error) {
	out := make([]domain.Summary, 0, len(m.rows))
	for _, r := range m.rows {
		out = append(out, r.Summary)
	}
	return out, nil
}

func testAuditHandler(t *testing.T) (http.Handler, *authapp.Memory) {
	t.Helper()
	mem := authapp.NewMemory()
	h := authapp.StaticHasher{
		HashFn:    func(p string) (string, error) { return "h:" + p, nil },
		CompareFn: func(hash, password string) bool { return hash == "h:"+password },
	}
	svc := authapp.NewService(mem, mem, mem, h)
	authAPI := authhttp.API{Cfg: env.Config{AppEnv: "test", WebOrigin: "http://localhost:3000", SessionSecret: "test-session-secret-32-chars-long"}, Svc: svc}
	now := time.Date(2026, 9, 21, 12, 0, 0, 0, time.UTC)
	store := &memAudit{rows: []domain.Detail{{
		Summary: domain.Summary{ID: "aud1", OccurredAt: now, ActorType: domain.ActorUser, Action: "user.register", EntityType: "User", Outcome: domain.OutcomeSuccess, CorrelationID: "req_test", SchemaVersion: 1},
		After:   map[string]any{"username": "namauser"},
	}}}
	auditAPI := API{Auth: authAPI, Query: &auditapp.QueryService{Store: store, Secret: "test-session-secret-32-chars-long"}}
	handler := httpx.NewRouter(authAPI.Cfg, slog.New(slog.NewTextHandler(io.Discard, nil)), nil, func(r chi.Router) {
		authAPI.Mount(r)
		auditAPI.Mount(r)
	})
	return handler, mem
}

func csrf(t *testing.T, h http.Handler) (string, []*http.Cookie) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/auth/csrf", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var body map[string]string
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	return body["csrfToken"], rec.Result().Cookies()
}

func withCookies(req *http.Request, cookies []*http.Cookie) {
	for _, c := range cookies {
		req.AddCookie(c)
	}
}

func loginUser(t *testing.T, h http.Handler) []*http.Cookie {
	t.Helper()
	token, cookies := csrf(t, h)
	req := httptest.NewRequest(http.MethodPost, "/api/register", strings.NewReader(`{"name":"Nama User","username":"namauser","email":"nama@example.test","password":"password12","confirmPassword":"password12"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", token)
	withCookies(req, cookies)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("register %d %s", rec.Code, rec.Body.String())
	}
	token, cookies = csrf(t, h)
	req = httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"namauser","password":"password12"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", token)
	withCookies(req, cookies)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("login %d %s", rec.Code, rec.Body.String())
	}
	return rec.Result().Cookies()
}

func TestUserForbiddenOnAudit(t *testing.T) {
	h, _ := testAuditHandler(t)
	cookies := loginUser(t, h)
	req := httptest.NewRequest(http.MethodGet, "/api/admin/audit-logs", nil)
	withCookies(req, cookies)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("list %d %s", rec.Code, rec.Body.String())
	}
	req = httptest.NewRequest(http.MethodGet, "/api/admin/audit-logs/aud1", nil)
	withCookies(req, cookies)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("detail %d %s", rec.Code, rec.Body.String())
	}
}

func TestAdminCanListAndGetAudit(t *testing.T) {
	h, mem := testAuditHandler(t)
	cookies := loginUser(t, h)
	u, err := mem.GetByUsernameOrEmail(context.Background(), "namauser")
	if err != nil {
		t.Fatal(err)
	}
	mem.PromoteAdmin(u.ID)
	req := httptest.NewRequest(http.MethodGet, "/api/admin/audit-logs", nil)
	withCookies(req, cookies)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list %d %s", rec.Code, rec.Body.String())
	}
	req = httptest.NewRequest(http.MethodGet, "/api/admin/audit-logs/aud1", nil)
	withCookies(req, cookies)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("detail %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "namauser") {
		t.Fatalf("detail body %s", rec.Body.String())
	}
}
