package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	authdomain "myticketin/internal/modules/auth/domain"
	authhttp "myticketin/internal/modules/auth/httpapi"
	checkinapp "myticketin/internal/modules/checkin/application"
	"myticketin/internal/modules/checkin/domain"
	apierrors "myticketin/internal/platform/errors"
	"myticketin/internal/platform/logger"
)

type API struct {
	Auth authhttp.API
	Svc  *checkinapp.Service
}

func (a API) Mount(r chi.Router) {
	r.Get("/api/events/{eventId}/scanner-access", a.access)
	r.Post("/api/events/{eventId}/check-ins", a.checkIn)
	r.Get("/api/events/{eventId}/check-in-attempts", a.list)
}

func (a API) access(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	out, err := a.Svc.ScannerAccess(r.Context(), actor, chi.URLParam(r, "eventId"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, out)
}

func (a API) checkIn(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	var body struct {
		InputType     string         `json:"inputType"`
		Value         string         `json:"value"`
		ClientContext map[string]any `json:"clientContext"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<14)).Decode(&body); err != nil {
		writeErr(w, r, domain.ErrRequestInvalid)
		return
	}
	out, err := a.Svc.CheckIn(r.Context(), actor, chi.URLParam(r, "eventId"), domain.Input{
		Type: domain.InputType(strings.ToUpper(strings.TrimSpace(body.InputType))), Raw: body.Value, Context: body.ClientContext,
	}, strings.TrimSpace(r.Header.Get("Idempotency-Key")), a.Auth.ClientIP(r))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, out)
}

func (a API) list(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	items, next, err := a.Svc.ListAttempts(r.Context(), actor, chi.URLParam(r, "eventId"), q.Get("result"), q.Get("from"), q.Get("to"), q.Get("cursor"), limit)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{"items": items, "nextCursor": next})
}

func writeData(w http.ResponseWriter, r *http.Request, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Vary", "Cookie")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"data": data, "correlationId": logger.CorrelationFrom(r.Context())})
}

func writeErr(w http.ResponseWriter, r *http.Request, err error) {
	id := logger.CorrelationFrom(r.Context())
	status, code, msg := http.StatusBadRequest, err.Error(), "Check-in tidak dapat diproses."
	switch {
	case errors.Is(err, authdomain.ErrCSRFInvalid):
		status, code, msg = http.StatusForbidden, authdomain.ErrCSRFInvalid.Error(), "Sesi formulir tidak valid. Muat ulang halaman."
	case errors.Is(err, domain.ErrAccessDenied), errors.Is(err, authdomain.ErrForbidden):
		status, code, msg = http.StatusForbidden, domain.ErrAccessDenied.Error(), "Anda tidak berhak memindai event ini."
	case errors.Is(err, domain.ErrNotFound):
		status, msg = http.StatusNotFound, "Event tidak ditemukan."
	case errors.Is(err, domain.ErrRequestInvalid):
		status, msg = http.StatusBadRequest, "Permintaan check-in tidak valid."
	case errors.Is(err, domain.ErrKeyRequired):
		status, msg = http.StatusBadRequest, "Header Idempotency-Key wajib diisi."
	case errors.Is(err, domain.ErrKeyReused):
		status, msg = http.StatusConflict, "Kunci idempotensi sudah dipakai untuk permintaan berbeda."
	case errors.Is(err, domain.ErrRateLimited):
		status, msg = http.StatusTooManyRequests, "Terlalu banyak pemindaian. Coba lagi nanti."
	case errors.Is(err, domain.ErrUnavailable):
		status, msg = http.StatusServiceUnavailable, "Layanan check-in tidak tersedia."
	}
	apierrors.Write(w, status, code, msg, id)
}
