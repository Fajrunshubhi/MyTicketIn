package httpx

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"myticketin/internal/platform/env"
	"myticketin/internal/platform/logger"
)

type stubPing struct{ err error }

func (s stubPing) Ping(context.Context) error { return s.err }

func testCfg() env.Config {
	return env.Config{
		AppEnv:    "test",
		WebOrigin: "http://localhost:3000",
		Version:   "test",
	}
}

func TestHealthOK(t *testing.T) {
	h := NewRouter(testCfg(), slog.New(slog.NewTextHandler(io.Discard, nil)), stubPing{}, nil)
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("expected no-store")
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["status"] != "ready" {
		t.Fatalf("body %#v", body)
	}
	if rec.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("nosniff")
	}
}

func TestHealthUnhealthyDoesNotWriteJSONStore(t *testing.T) {
	dir := t.TempDir()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(wd) })

	h := NewRouter(testCfg(), slog.New(slog.NewTextHandler(io.Discard, nil)), stubPing{err: context.DeadlineExceeded}, nil)
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "postgres") || strings.Contains(rec.Body.String(), "host") {
		t.Fatalf("leaked topology: %s", rec.Body.String())
	}
	if _, err := os.Stat(filepath.Join(dir, "data", "users.json")); err == nil {
		t.Fatal("must not create JSON fallback")
	}
}

func TestMeta(t *testing.T) {
	h := NewRouter(testCfg(), slog.New(slog.NewTextHandler(io.Discard, nil)), stubPing{}, nil)
	req := httptest.NewRequest(http.MethodGet, "/api/meta", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["locale"] != "id-ID" || body["currency"] != "IDR" {
		t.Fatalf("body %#v", body)
	}
}

func TestCorrelationUsesHeader(t *testing.T) {
	h := NewRouter(testCfg(), slog.New(slog.NewTextHandler(io.Discard, nil)), stubPing{}, nil)
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req.Header.Set("X-Correlation-Id", "req_fixedid01")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Header().Get("X-Correlation-Id") != "req_fixedid01" {
		t.Fatalf("got %s", rec.Header().Get("X-Correlation-Id"))
	}
}

func TestLoggerContext(t *testing.T) {
	ctx := logger.WithCorrelation(context.Background(), "req_abc")
	if logger.CorrelationFrom(ctx) != "req_abc" {
		t.Fatal("missing correlation")
	}
}

func TestLiveDoesNotRequireDatabase(t *testing.T) {
	h := NewRouter(testCfg(), slog.New(slog.NewTextHandler(io.Discard, nil)), nil, nil)
	req := httptest.NewRequest(http.MethodGet, "/api/health/live", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatal(rec.Code, rec.Body.String())
	}
	if rec.Header().Get("X-Correlation-Id") == "" {
		t.Fatal("correlation")
	}
}

func TestReadyUnhealthyRetryAfter(t *testing.T) {
	h := NewRouter(testCfg(), slog.New(slog.NewTextHandler(io.Discard, nil)), nil, nil)
	req := httptest.NewRequest(http.MethodGet, "/api/health/ready", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatal(rec.Code)
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Fatal("retry-after")
	}
	if strings.Contains(rec.Body.String(), "postgres") {
		t.Fatal(rec.Body.String())
	}
}
