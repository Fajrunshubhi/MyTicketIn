package opshttp

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"myticketin/internal/platform/env"
)

func TestSmokeHiddenOnProductionDemo(t *testing.T) {
	api := API{Cfg: env.Config{AppEnv: "production-demo", SchedulerSecret: "scheduler-secret-32-chars-minimum-ok"}}
	r := chi.NewRouter()
	api.Mount(r)
	req := httptest.NewRequest(http.MethodPost, "/api/internal/smoke/payment-webhook", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatal(rec.Code, rec.Body.String())
	}
}

func TestSmokeUnauthorizedOnPreview(t *testing.T) {
	api := API{Cfg: env.Config{AppEnv: "preview", SchedulerSecret: "scheduler-secret-32-chars-minimum-ok"}}
	r := chi.NewRouter()
	api.Mount(r)
	req := httptest.NewRequest(http.MethodPost, "/api/internal/smoke/payment-webhook", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatal(rec.Code, rec.Body.String())
	}
}
