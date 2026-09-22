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
	ticketapp "myticketin/internal/modules/tickets/application"
	"myticketin/internal/modules/tickets/domain"
	apierrors "myticketin/internal/platform/errors"
	"myticketin/internal/platform/logger"
)

type API struct {
	Auth            authhttp.API
	Svc             *ticketapp.Service
	SchedulerSecret string
}

func (a API) Mount(r chi.Router) {
	r.Get("/api/tickets", a.list)
	r.Get("/api/tickets/{id}/qr", a.qr)
	r.Get("/api/tickets/{id}", a.get)
	r.Post("/api/internal/jobs/reconcile-ticket-issuance", a.reconcile)
}

func (a API) list(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	items, next, err := a.Svc.List(r.Context(), actor, strings.ToUpper(strings.TrimSpace(q.Get("status"))), q.Get("cursor"), limit)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{"items": items, "nextCursor": next})
}

func (a API) get(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	ticket, err := a.Svc.Get(r.Context(), actor, chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{"ticket": ticket})
}

func (a API) qr(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	png, err := a.Svc.RenderQR(r.Context(), actor, chi.URLParam(r, "id"), a.Auth.ClientIP(r))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Content-Disposition", `inline; filename="ticket-qr.png"`)
	w.Header().Set("Cache-Control", "private, no-store, max-age=0")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Vary", "Cookie")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(png)
}

func (a API) reconcile(w http.ResponseWriter, r *http.Request) {
	if !secretOK(a.SchedulerSecret, r.Header.Get("X-Scheduler-Secret")) {
		writeErr(w, r, domain.ErrJobUnauthorized)
		return
	}
	var body struct {
		BatchSize int `json:"batchSize"`
	}
	_ = json.NewDecoder(io.LimitReader(r.Body, 1<<12)).Decode(&body)
	out, err := a.Svc.Reconcile(r.Context(), body.BatchSize)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, out)
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
	w.Header().Set("Vary", "Cookie")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"data": data, "correlationId": logger.CorrelationFrom(r.Context())})
}

func writeErr(w http.ResponseWriter, r *http.Request, err error) {
	id := logger.CorrelationFrom(r.Context())
	status, code, msg := http.StatusBadRequest, err.Error(), "Tiket tidak dapat diproses."
	switch {
	case errors.Is(err, authdomain.ErrCSRFInvalid):
		status, code, msg = http.StatusForbidden, authdomain.ErrCSRFInvalid.Error(), "Sesi formulir tidak valid. Muat ulang halaman."
	case errors.Is(err, domain.ErrAccessDenied), errors.Is(err, authdomain.ErrForbidden):
		status, code, msg = http.StatusForbidden, domain.ErrAccessDenied.Error(), "Anda tidak berhak melihat tiket ini."
	case errors.Is(err, domain.ErrNotFound):
		status, msg = http.StatusNotFound, "Tiket tidak ditemukan."
	case errors.Is(err, domain.ErrQRUnavailable), errors.Is(err, domain.ErrCancelled):
		status, msg = http.StatusConflict, "Kode QR tidak tersedia untuk tiket ini."
	case errors.Is(err, domain.ErrRateLimited):
		status, msg = http.StatusTooManyRequests, "Terlalu banyak permintaan. Coba lagi nanti."
	case errors.Is(err, domain.ErrJobUnauthorized):
		status, msg = http.StatusUnauthorized, "Job scheduler tidak terotorisasi."
	case errors.Is(err, domain.ErrIssuanceInvariant), errors.Is(err, domain.ErrNotIssued):
		status, msg = http.StatusConflict, "Penerbitan tiket tidak lengkap."
	}
	apierrors.Write(w, status, code, msg, id)
}
