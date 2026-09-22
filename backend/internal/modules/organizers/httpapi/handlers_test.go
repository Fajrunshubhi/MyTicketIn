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

	authapp "myticketin/internal/modules/auth/application"
	authhttp "myticketin/internal/modules/auth/httpapi"
	orgapp "myticketin/internal/modules/organizers/application"
	"myticketin/internal/platform/env"
	"myticketin/internal/platform/httpx"
)

func testHandler(t *testing.T) (http.Handler, *authapp.Memory) {
	t.Helper()
	users := authapp.NewMemory()
	h := authapp.StaticHasher{
		HashFn:    func(p string) (string, error) { return "h:" + p, nil },
		CompareFn: func(hash, password string) bool { return hash == "h:"+password },
	}
	orgMem := orgapp.NewMemory()
	authSvc := authapp.NewService(users, users, users, h)
	authSvc.Organizers = orgapp.StatusLookup{Store: orgMem}
	orgSvc := orgapp.NewService(orgMem)
	authAPI := authhttp.API{Cfg: env.Config{AppEnv: "test", WebOrigin: "http://localhost:3000", SessionSecret: "test-session-secret-32-chars-long"}, Svc: authSvc}
	api := API{Auth: authAPI, Svc: orgSvc, Secret: "test-session-secret-32-chars-long"}
	handler := httpx.NewRouter(authAPI.Cfg, slog.New(slog.NewTextHandler(io.Discard, nil)), nil, func(r chi.Router) {
		authAPI.Mount(r)
		api.Mount(r)
	})
	return handler, users
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

func csrfFrom(cookies []*http.Cookie) string {
	for _, c := range cookies {
		if c.Name == "mti_csrf" {
			return c.Value
		}
	}
	return ""
}

func registerLogin(t *testing.T, h http.Handler, username, email string) []*http.Cookie {
	t.Helper()
	token, cookies := csrf(t, h)
	req := httptest.NewRequest(http.MethodPost, "/api/register", strings.NewReader(`{"name":"Nama User","username":"`+username+`","email":"`+email+`","password":"password12","confirmPassword":"password12"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", token)
	withCookies(req, cookies)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("register %d %s", rec.Code, rec.Body.String())
	}
	token, cookies = csrf(t, h)
	req = httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"`+username+`","password":"password12"}`))
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

func TestOrganizerSubmitAndUserForbiddenOnAdmin(t *testing.T) {
	h, mem := testHandler(t)
	cookies := registerLogin(t, h, "namauser", "nama@example.test")
	req := httptest.NewRequest(http.MethodPost, "/api/organizer/applications", strings.NewReader(`{"name":"Organizer Satu","contactEmail":"org@example.test","description":"Deskripsi organizer yang cukup panjang."}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", csrfFrom(cookies))
	withCookies(req, cookies)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("submit %d %s", rec.Code, rec.Body.String())
	}
	req = httptest.NewRequest(http.MethodGet, "/api/organizer/application", nil)
	withCookies(req, cookies)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("own %d %s", rec.Code, rec.Body.String())
	}
	req = httptest.NewRequest(http.MethodGet, "/api/admin/organizer-applications", nil)
	withCookies(req, cookies)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("admin list %d %s", rec.Code, rec.Body.String())
	}

	u, err := mem.GetByUsernameOrEmail(context.Background(), "namauser")
	if err != nil {
		t.Fatal(err)
	}
	mem.PromoteAdmin(u.ID)
	req = httptest.NewRequest(http.MethodGet, "/api/admin/organizer-applications", nil)
	withCookies(req, cookies)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("admin after promote %d %s", rec.Code, rec.Body.String())
	}
}

func TestSecondUserCannotReadFirstApplication(t *testing.T) {
	h, _ := testHandler(t)
	a := registerLogin(t, h, "userone", "one@example.test")
	req := httptest.NewRequest(http.MethodPost, "/api/organizer/applications", strings.NewReader(`{"name":"Organizer Satu","contactEmail":"org@example.test","description":"Deskripsi organizer yang cukup panjang."}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", csrfFrom(a))
	withCookies(req, a)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("submit %d %s", rec.Code, rec.Body.String())
	}
	b := registerLogin(t, h, "usertwo", "two@example.test")
	req = httptest.NewRequest(http.MethodGet, "/api/organizer/application", nil)
	withCookies(req, b)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("other own %d %s", rec.Code, rec.Body.String())
	}
}
