package opshttp

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	authdomain "myticketin/internal/modules/auth/domain"
	authhttp "myticketin/internal/modules/auth/httpapi"
	payapp "myticketin/internal/modules/payments/application"
	paydomain "myticketin/internal/modules/payments/domain"
	"myticketin/internal/platform/env"
	apierrors "myticketin/internal/platform/errors"
	"myticketin/internal/platform/logger"
	"myticketin/internal/platform/ops"
)

type API struct {
	Auth authhttp.API
	Cfg  env.Config
	Pool *pgxpool.Pool
	Pay  *payapp.Service
}

func (a API) Mount(r chi.Router) {
	r.Get("/api/admin/operations/health", a.health)
	if a.Cfg.AppEnv == "test" || a.Cfg.AppEnv == "preview" {
		r.Post("/api/internal/smoke/payment-webhook", a.smokeWebhook)
	}
}

func (a API) health(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	if !actor.IsActive() || actor.Role != authdomain.RoleAdmin {
		apierrors.Write(w, http.StatusForbidden, "FORBIDDEN", "Anda tidak memiliki akses.", logger.CorrelationFrom(r.Context()))
		return
	}
	mem := ops.Process.Snapshot(5 * time.Minute)
	sql := ops.QuerySnapshot(r.Context(), a.Pool)
	fresh := backupFreshness()
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, max-age=30")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data": map[string]any{
			"window":                   "5m",
			"requestErrorRate":         mem.RequestErrorRate,
			"webhookFailures":          sql.WebhookFailures,
			"expiryLag":                sql.ExpiryLag,
			"notificationLag":          sql.NotificationLag,
			"reminderLag":              sql.ReminderLag,
			"checkInP95":               sql.CheckInP95,
			"recommendationP95":        mem.RecommendationP95,
			"aiProviderFailures":       0,
			"aiDegradedCount":          0,
			"loyaltyReplayConflicts":   0,
			"loyaltyInvariantFailures": sql.LoyaltyInvariantFailures,
			"backupFreshness":          fresh,
			"alerts":                   alertsOf(mem, sql, fresh),
			"sandbox":                  true,
		},
		"correlationId": logger.CorrelationFrom(r.Context()),
	})
}

func (a API) smokeWebhook(w http.ResponseWriter, r *http.Request) {
	if a.Cfg.SchedulerSecret == "" || subtle.ConstantTimeCompare([]byte(a.Cfg.SchedulerSecret), []byte(r.Header.Get("X-Scheduler-Secret"))) != 1 {
		apierrors.Write(w, http.StatusUnauthorized, "FORBIDDEN", "Job scheduler tidak terotorisasi.", logger.CorrelationFrom(r.Context()))
		return
	}
	if a.Pay == nil {
		apierrors.Write(w, http.StatusServiceUnavailable, apierrors.CodeServiceUnhealthy, "Layanan tidak siap.", logger.CorrelationFrom(r.Context()))
		return
	}
	body := []byte(`{"eventId":"smoke-rfc014","eventType":"payment.failed","externalReference":"sbx_smoke","amountRupiah":1000,"currency":"IDR"}`)
	sig := paydomain.SignBody(a.Cfg.PaymentWebhookSecret, body)
	_ = a.Pay.ProcessWebhook(r.Context(), "sandbox", body, map[string]string{"X-Sandbox-Signature": sig})
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data":          map[string]any{"received": true, "sandbox": true, "safe": true},
		"correlationId": logger.CorrelationFrom(r.Context()),
	})
}

func backupFreshness() string {
	raw := strings.TrimSpace(os.Getenv("BACKUP_SNAPSHOT_AT"))
	if raw == "" {
		return "unknown"
	}
	at, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return "invalid"
	}
	if time.Since(at) > 24*time.Hour {
		return "stale"
	}
	return "fresh"
}

func alertsOf(mem ops.Snapshot, sql ops.SnapshotSQL, backup string) []string {
	var out []string
	if mem.RequestErrorRate > 0.05 {
		out = append(out, "request-error-rate")
	}
	if sql.ExpiryLag > 0 {
		out = append(out, "expiry-lag")
	}
	if sql.NotificationLag > 0 {
		out = append(out, "notification-lag")
	}
	if sql.ReminderLag > 0 {
		out = append(out, "reminder-lag")
	}
	if sql.CheckInP95 > 1500 {
		out = append(out, "checkin-p95")
	}
	if mem.RecommendationP95 > 500 {
		out = append(out, "recommendation-p95")
	}
	if sql.LoyaltyInvariantFailures > 0 {
		out = append(out, "loyalty-invariant")
	}
	if backup != "fresh" {
		out = append(out, "backup-freshness")
	}
	return out
}
