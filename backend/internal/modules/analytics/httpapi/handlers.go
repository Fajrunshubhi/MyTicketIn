package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	analyticsapp "myticketin/internal/modules/analytics/application"
	authapp "myticketin/internal/modules/auth/application"
	"myticketin/internal/modules/auth/domain"
	authhttp "myticketin/internal/modules/auth/httpapi"
	apierrors "myticketin/internal/platform/errors"
	"myticketin/internal/platform/logger"
)

type API struct {
	Auth  authhttp.API
	Emit  *analyticsapp.Emitter
	Rates authapp.RateStore
}

func (a API) Mount(r chi.Router) {
	r.Post("/api/analytics/events", a.post)
}

func (a API) post(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.limit(r); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		EventName        string         `json:"eventName"`
		OccurredAt       string         `json:"occurredAt"`
		SchemaVersion    int16          `json:"schemaVersion"`
		Properties       map[string]any `json:"properties"`
		DeduplicationKey string         `json:"deduplicationKey"`
		ActorUserID      string         `json:"actorUserId"`
		EntityType       string         `json:"entityType"`
		EntityID         string         `json:"entityId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, r, analyticsapp.ErrInvalid)
		return
	}
	var occurred time.Time
	if body.OccurredAt != "" {
		t, err := time.Parse(time.RFC3339, body.OccurredAt)
		if err != nil {
			writeErr(w, r, analyticsapp.ErrInvalid)
			return
		}
		occurred = t
	}
	in := analyticsapp.Input{
		Name:             body.EventName,
		OccurredAt:       occurred,
		SchemaVersion:    body.SchemaVersion,
		Properties:       body.Properties,
		DeduplicationKey: body.DeduplicationKey,
		Client:           true,
		AnonymousSeed:    a.Auth.ClientIP(r),
	}
	if user, _, err := sessionOptional(a.Auth, r); err == nil {
		in.ActorUserID = user.ID
		in.AnonymousSeed = ""
	}
	_ = body.ActorUserID
	_ = body.EntityType
	_ = body.EntityID
	if err := a.Emit.Emit(r.Context(), in); err != nil {
		if errors.Is(err, analyticsapp.ErrDegraded) {
			writeJSON(w, http.StatusAccepted, map[string]any{
				"data":          map[string]any{"accepted": true, "degraded": true},
				"correlationId": logger.CorrelationFrom(r.Context()),
			})
			return
		}
		writeErr(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeJSON(w, http.StatusAccepted, map[string]any{
		"data":          map[string]any{"accepted": true},
		"correlationId": logger.CorrelationFrom(r.Context()),
	})
}

func sessionOptional(auth authhttp.API, r *http.Request) (domain.User, domain.Session, error) {
	return auth.Svc.SessionFromToken(r.Context(), readCookie(r, "mti_session"))
}

func readCookie(r *http.Request, name string) string {
	c, err := r.Cookie(name)
	if err != nil {
		return ""
	}
	return c.Value
}

func (a API) limit(r *http.Request) error {
	if a.Rates == nil {
		return nil
	}
	key := authapp.TokenHash(authapp.HashRateKey("analytics", a.Auth.ClientIP(r), ""))
	n, err := a.Rates.Hit(r.Context(), key, "analytics", time.Hour)
	if err != nil {
		return analyticsapp.ErrDegraded
	}
	if n > 60 {
		return analyticsapp.ErrRateLimited
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeErr(w http.ResponseWriter, r *http.Request, err error) {
	id := logger.CorrelationFrom(r.Context())
	code := err.Error()
	status := http.StatusBadRequest
	msg := "Event analitik tidak valid."
	switch {
	case errors.Is(err, analyticsapp.ErrNotAllowed):
		status, msg = http.StatusBadRequest, "Event analitik tidak diizinkan."
	case errors.Is(err, analyticsapp.ErrTooLarge):
		status, msg = http.StatusBadRequest, "Payload analitik terlalu besar."
	case errors.Is(err, analyticsapp.ErrRateLimited):
		status, msg = http.StatusTooManyRequests, "Terlalu banyak event analitik."
	case errors.Is(err, domain.ErrCSRFInvalid):
		status, msg = http.StatusForbidden, "Permintaan tidak valid."
		code = domain.ErrCSRFInvalid.Error()
	case errors.Is(err, analyticsapp.ErrInvalid):
		status, msg = http.StatusBadRequest, "Event analitik tidak valid."
	default:
		status, code, msg = http.StatusInternalServerError, apierrors.CodeInternalError, "Terjadi kesalahan internal."
	}
	apierrors.Write(w, status, code, msg, id)
}
