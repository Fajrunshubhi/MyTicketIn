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

	"myticketin/internal/modules/auth/application"
	"myticketin/internal/platform/env"
	"myticketin/internal/platform/httpx"
)

func testAPI(t *testing.T) (http.Handler, *application.Memory) {
	t.Helper()
	mem := application.NewMemory()
	h := application.StaticHasher{
		HashFn:    func(p string) (string, error) { return "h:" + p, nil },
		CompareFn: func(hash, password string) bool { return hash == "h:"+password },
	}
	svc := application.NewService(mem, mem, mem, h)
	svc.Resets = mem
	api := API{Cfg: env.Config{AppEnv: "test", WebOrigin: "http://localhost:3000", SessionSecret: "test-session-secret-32-chars-long"}, Svc: svc}
	return httpx.NewRouter(api.Cfg, slog.New(slog.NewTextHandler(io.Discard, nil)), nil, api.Mount), mem
}

func csrf(t *testing.T, h http.Handler) (token string, cookies []*http.Cookie) {
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

func TestRegisterLoginMeAndForbidden(t *testing.T) {
	h, _ := testAPI(t)
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
	sessionCookies := rec.Result().Cookies()

	req = httptest.NewRequest(http.MethodGet, "/api/me", nil)
	withCookies(req, sessionCookies)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("me %d %s", rec.Code, rec.Body.String())
	}

	var csrfToken string
	for _, c := range sessionCookies {
		if c.Name == "mti_csrf" {
			csrfToken = c.Value
		}
	}
	req = httptest.NewRequest(http.MethodPatch, "/api/me", strings.NewReader(`{"name":"Nama Baru","email":"baru@example.test"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", csrfToken)
	withCookies(req, sessionCookies)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("patch me %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "baru@example.test") {
		t.Fatalf("patch me body %s", rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/ping", nil)
	withCookies(req, sessionCookies)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("admin ping USER must 403, got %d %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/users/someone-else", nil)
	withCookies(req, sessionCookies)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("foreign profile must 403, got %d", rec.Code)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/me/sessions/revoke", nil)
	req.Header.Set("X-CSRF-Token", csrfToken)
	withCookies(req, sessionCookies)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("revoke %d %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/me", nil)
	withCookies(req, sessionCookies)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("revoked session %d", rec.Code)
	}
}

func TestRegisterWithoutCSRF(t *testing.T) {
	h, _ := testAPI(t)
	req := httptest.NewRequest(http.MethodPost, "/api/register", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("got %d", rec.Code)
	}
}

func TestRegisterRejectsAdminIntent(t *testing.T) {
	h, _ := testAPI(t)
	token, cookies := csrf(t, h)
	req := httptest.NewRequest(http.MethodPost, "/api/register", strings.NewReader(`{"name":"Nama User","username":"namauser","email":"nama@example.test","password":"password12","confirmPassword":"password12","intent":"admin"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", token)
	withCookies(req, cookies)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}

func TestLoginPortalDeniedAndAdminOk(t *testing.T) {
	h, mem := testAPI(t)
	token, cookies := csrf(t, h)
	req := httptest.NewRequest(http.MethodPost, "/api/register", strings.NewReader(`{"name":"Nama User","username":"namauser","email":"nama@example.test","password":"password12","confirmPassword":"password12","intent":"buyer"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", token)
	withCookies(req, cookies)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("register %d %s", rec.Code, rec.Body.String())
	}

	token, cookies = csrf(t, h)
	req = httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"namauser","password":"password12","portal":"admin"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", token)
	withCookies(req, cookies)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("USER admin portal %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "bukan admin") {
		t.Fatalf("admin deny message %s", rec.Body.String())
	}

	token, cookies = csrf(t, h)
	req = httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"namauser","password":"password12","portal":"organizer"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", token)
	withCookies(req, cookies)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("USER organizer portal %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "pembeli tiket") {
		t.Fatalf("organizer deny message %s", rec.Body.String())
	}

	u, err := mem.GetByUsernameOrEmail(context.Background(), "namauser")
	if err != nil {
		t.Fatal(err)
	}
	mem.PromoteAdmin(u.ID)

	token, cookies = csrf(t, h)
	req = httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"namauser","password":"password12","portal":"buyer"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", token)
	withCookies(req, cookies)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("ADMIN buyer portal %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "portal Admin aplikasi") {
		t.Fatalf("admin as buyer message %s", rec.Body.String())
	}

	token, cookies = csrf(t, h)
	req = httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"namauser","password":"password12","portal":"admin"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", token)
	withCookies(req, cookies)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("ADMIN admin portal %d %s", rec.Code, rec.Body.String())
	}
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if jsonPath(body, "data", "nextPath") != "/dashboard" {
		t.Fatalf("nextPath %+v", body)
	}
}

func jsonPath(m map[string]any, keys ...string) string {
	var cur any = m
	for _, k := range keys {
		obj, ok := cur.(map[string]any)
		if !ok {
			return ""
		}
		cur = obj[k]
	}
	s, _ := cur.(string)
	return s
}

func TestPasswordResetRequestAccepted(t *testing.T) {
	h, _ := testAPI(t)
	token, cookies := csrf(t, h)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/password-reset/request", strings.NewReader(`{"email":"missing@example.test"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", token)
	withCookies(req, cookies)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("reset request %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "memenuhi syarat") {
		t.Fatalf("generic message %s", rec.Body.String())
	}
}
