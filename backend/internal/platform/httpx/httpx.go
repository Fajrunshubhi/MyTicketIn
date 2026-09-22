package httpx

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"regexp"
	"time"

	"github.com/go-chi/chi/v5"

	"myticketin/internal/platform/env"
	apierrors "myticketin/internal/platform/errors"
	"myticketin/internal/platform/logger"
	"myticketin/internal/platform/ops"
)

type Pinger interface {
	Ping(ctx context.Context) error
}

var correlationPattern = regexp.MustCompile(`^req_[A-Za-z0-9_-]{8,128}$`)

func NewRouter(cfg env.Config, log *slog.Logger, db Pinger, mount func(chi.Router)) http.Handler {
	r := chi.NewRouter()
	r.Use(correlationMiddleware)
	r.Use(securityHeaders(cfg))
	r.Use(accessLog(log))
	r.Use(recoverMiddleware(log))
	r.Get("/api/health", Ready(cfg, db))
	r.Get("/api/health/live", Live(cfg))
	r.Get("/api/health/ready", Ready(cfg, db))
	r.Get("/api/meta", Meta(cfg))
	if mount != nil {
		mount(r)
	}
	return CORS(cfg.WebOrigin, r)
}

func CORS(origin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Permissions-Policy", "camera=(self)")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Vary", "Origin")
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Correlation-Id,Idempotency-Key,X-CSRF-Token,X-Sandbox-Signature")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func securityHeaders(cfg env.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("X-Frame-Options", "DENY")
			w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
			w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
			if cfg.AppEnv == "production-demo" {
				w.Header().Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
			}
			next.ServeHTTP(w, r)
		})
	}
}

func correlationMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Correlation-Id")
		if !correlationPattern.MatchString(id) {
			id = newCorrelationID()
		}
		ctx := logger.WithCorrelation(r.Context(), id)
		w.Header().Set("X-Correlation-Id", id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func accessLog(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(sw, r)
			outcome := "ok"
			if sw.status >= 500 {
				outcome = "error"
			} else if sw.status >= 400 {
				outcome = "client_error"
			}
			ops.Process.Observe(r.URL.Path, sw.status, time.Since(start).Milliseconds(), outcome)
			log.Info("request",
				"correlationId", logger.CorrelationFrom(r.Context()),
				"route", r.URL.Path,
				"status", sw.status,
				"outcome", outcome,
				"durationMs", time.Since(start).Milliseconds(),
			)
		})
	}
}

func recoverMiddleware(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					log.Error("panic", "correlationId", logger.CorrelationFrom(r.Context()))
					apierrors.Write(w, http.StatusInternalServerError, apierrors.CodeInternalError, "Terjadi kesalahan internal.", logger.CorrelationFrom(r.Context()))
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func newCorrelationID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "req_unavailable"
	}
	return "req_" + hex.EncodeToString(b[:])
}

func Live(cfg env.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/json")
		id := logger.CorrelationFrom(r.Context())
		if id == "" {
			id = newCorrelationID()
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"status":        "ok",
			"version":       cfg.Version,
			"correlationId": id,
		})
	}
}

func Ready(cfg env.Config, db Pinger) http.HandlerFunc {
	return Health(cfg, db)
}

func Health(cfg env.Config, db Pinger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/json")
		id := logger.CorrelationFrom(r.Context())
		if id == "" {
			id = newCorrelationID()
		}

		if db == nil {
			apierrors.Write(w, http.StatusServiceUnavailable, apierrors.CodeServiceUnhealthy, "Layanan tidak siap.", id)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := db.Ping(ctx); err != nil {
			apierrors.Write(w, http.StatusServiceUnavailable, apierrors.CodeServiceUnhealthy, "Layanan tidak siap.", id)
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"status":        "ready",
			"checks":        map[string]string{"app": "ok", "database": "ok"},
			"version":       cfg.Version,
			"correlationId": id,
		})
	}
}

func Meta(cfg env.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "public, max-age=300")
		writeJSON(w, http.StatusOK, map[string]string{
			"locale":      "id-ID",
			"currency":    "IDR",
			"environment": cfg.AppEnv,
			"version":     cfg.Version,
		})
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
