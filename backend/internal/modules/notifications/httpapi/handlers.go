package httpapi

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	authdomain "myticketin/internal/modules/auth/domain"
	authhttp "myticketin/internal/modules/auth/httpapi"
	notifyapp "myticketin/internal/modules/notifications/application"
	"myticketin/internal/modules/notifications/domain"
	apierrors "myticketin/internal/platform/errors"
	"myticketin/internal/platform/logger"
)

type API struct {
	Auth            authhttp.API
	Svc             *notifyapp.Service
	SchedulerSecret string
}

func (a API) Mount(r chi.Router) {
	r.Get("/api/me/notifications", a.list)
	r.Post("/api/me/notifications/read-all", a.readAll)
	r.Post("/api/me/notifications/{id}/read", a.read)
	r.Post("/api/internal/jobs/send-event-reminders", a.reminders)
	r.Post("/api/internal/jobs/dispatch-notifications", a.dispatch)
}

func (a API) list(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	out, err := a.Svc.List(r.Context(), actor, q.Get("filter"), q.Get("cursor"), limit)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, out)
}

func (a API) read(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	out, err := a.Svc.MarkRead(r.Context(), actor, chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, out)
}

func (a API) readAll(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	var body struct {
		Before string `json:"before"`
	}
	_ = json.NewDecoder(io.LimitReader(r.Body, 1<<12)).Decode(&body)
	out, err := a.Svc.MarkReadAll(r.Context(), actor, body.Before)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, out)
}

func (a API) reminders(w http.ResponseWriter, r *http.Request) {
	if !secretOK(a.SchedulerSecret, r.Header.Get("X-Scheduler-Secret")) {
		writeErr(w, r, domain.ErrJobUnauthorized)
		return
	}
	var body struct {
		BatchSize int `json:"batchSize"`
	}
	_ = json.NewDecoder(io.LimitReader(r.Body, 1<<12)).Decode(&body)
	out, err := a.Svc.ProduceReminders(r.Context(), body.BatchSize)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, out)
}

func (a API) dispatch(w http.ResponseWriter, r *http.Request) {
	if !secretOK(a.SchedulerSecret, r.Header.Get("X-Scheduler-Secret")) {
		writeErr(w, r, domain.ErrJobUnauthorized)
		return
	}
	n, err := a.Svc.Dispatch(r.Context(), 50)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{"dispatched": n})
}

func secretOK(want, got string) bool {
	if want == "" || got == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(want), []byte(got)) == 1
}

func writeData(w http.ResponseWriter, r *http.Request, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"data": data, "correlationId": logger.CorrelationFrom(r.Context())})
}

func writeErr(w http.ResponseWriter, r *http.Request, err error) {
	id := logger.CorrelationFrom(r.Context())
	status, code, msg := http.StatusBadRequest, err.Error(), "Notifikasi tidak dapat diproses."
	switch {
	case errors.Is(err, domain.ErrAccessDenied), errors.Is(err, authdomain.ErrForbidden):
		status, msg = http.StatusForbidden, "Anda tidak berhak."
	case errors.Is(err, domain.ErrNotFound):
		status, msg = http.StatusNotFound, "Notifikasi tidak ditemukan."
	case errors.Is(err, domain.ErrCursorInvalid):
		status, msg = http.StatusBadRequest, "Filter tidak valid."
	case errors.Is(err, domain.ErrJobUnauthorized):
		status, msg = http.StatusUnauthorized, "Job scheduler tidak terotorisasi."
	case errors.Is(err, domain.ErrJobFailed), errors.Is(err, domain.ErrEmailUnavailable):
		status, msg = http.StatusServiceUnavailable, "Layanan notifikasi tidak tersedia."
	case errors.Is(err, authdomain.ErrRateLimited):
		status, msg = http.StatusTooManyRequests, "Terlalu banyak permintaan."
	case errors.Is(err, authdomain.ErrCSRFInvalid):
		status, msg = http.StatusForbidden, "Sesi formulir tidak valid."
	}
	_ = strings.TrimSpace(code)
	apierrors.Write(w, status, code, msg, id)
}
