package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	authdomain "myticketin/internal/modules/auth/domain"
	authhttp "myticketin/internal/modules/auth/httpapi"
	reportapp "myticketin/internal/modules/reporting/application"
	"myticketin/internal/modules/reporting/domain"
	apierrors "myticketin/internal/platform/errors"
	"myticketin/internal/platform/logger"
)

type API struct {
	Auth authhttp.API
	Svc  *reportapp.Service
}

func (a API) Mount(r chi.Router) {
	r.Get("/api/organizer/dashboard", a.dashboard)
	r.Get("/api/organizer/events/{eventId}/sales-trend", a.trend)
	r.Get("/api/organizer/events/{eventId}/participants.csv", a.export)
	r.Get("/api/admin/operations", a.operations)
	r.Get("/api/admin/search", a.search)
	r.Get("/api/events/{slug}/recommendations", a.recommend)
}

func (a API) dashboard(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	out, err := a.Svc.Dashboard(r.Context(), actor, q.Get("eventId"), q.Get("from"), q.Get("to"), q.Get("cursor"), limit)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, out)
}

func (a API) trend(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	q := r.URL.Query()
	out, err := a.Svc.Trend(r.Context(), actor, chi.URLParam(r, "eventId"), q.Get("from"), q.Get("to"), q.Get("bucket"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, out)
}

func (a API) export(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	q := r.URL.Query()
	started := false
	start := func() {
		if started {
			return
		}
		started = true
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="peserta.csv"`)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "private, no-store")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("\uFEFFnomor_order,nama_pembeli_masked,email_masked,jenis_tiket,kategori_area,label_kursi,status_tiket,waktu_terbit,waktu_check_in\n"))
	}
	err = a.Svc.Export(r.Context(), actor, chi.URLParam(r, "eventId"), q.Get("ticketStatus"), q.Get("checkInResult"), q.Get("from"), q.Get("to"), func(batch []domain.Participant) error {
		start()
		for _, p := range batch {
			section, seat, checked := "", "", ""
			if p.SectionName != nil {
				section = *p.SectionName
			}
			if p.SeatLabel != nil {
				seat = *p.SeatLabel
			}
			if p.CheckedInAt != nil {
				checked = p.CheckedInAt.UTC().Format(time.RFC3339)
			}
			line := strings.Join([]string{
				domain.CSVCell(p.OrderNumber),
				domain.CSVCell(domain.MaskName(p.BuyerName)),
				domain.CSVCell(domain.MaskEmail(p.BuyerEmail)),
				domain.CSVCell(p.TicketType),
				domain.CSVCell(section),
				domain.CSVCell(seat),
				domain.CSVCell(p.TicketStatus),
				domain.CSVCell(p.IssuedAt.UTC().Format(time.RFC3339)),
				domain.CSVCell(checked),
			}, ",") + "\n"
			if _, err := w.Write([]byte(line)); err != nil {
				return err
			}
		}
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
		return nil
	})
	if err != nil && !started {
		writeErr(w, r, err)
		return
	}
	if !started {
		start()
	}
}

func (a API) operations(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	out, err := a.Svc.Operations(r.Context(), actor, q.Get("queue"), q.Get("cursor"), limit)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, out)
}

func (a API) search(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	q := r.URL.Query()
	out, err := a.Svc.Search(r.Context(), actor, q.Get("q"), q.Get("types"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, out)
}

func (a API) recommend(w http.ResponseWriter, r *http.Request) {
	actor, authed := a.Auth.OptionalUser(r)
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	out, err := a.Svc.Recommend(r.Context(), actor, authed, chi.URLParam(r, "slug"), limit)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if authed {
		w.Header().Set("Cache-Control", "private, no-store")
		w.Header().Set("Vary", "Cookie")
	} else {
		w.Header().Set("Cache-Control", "public, max-age=60")
	}
	writeData(w, r, http.StatusOK, out)
}

func writeData(w http.ResponseWriter, r *http.Request, status int, data any) {
	if w.Header().Get("Cache-Control") == "" {
		w.Header().Set("Cache-Control", "private, no-store")
		w.Header().Set("Vary", "Cookie")
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"data": data, "correlationId": logger.CorrelationFrom(r.Context())})
}

func writeErr(w http.ResponseWriter, r *http.Request, err error) {
	id := logger.CorrelationFrom(r.Context())
	status, code, msg := http.StatusBadRequest, err.Error(), "Laporan tidak dapat diproses."
	switch {
	case errors.Is(err, domain.ErrOrganizerRequired):
		status, msg = http.StatusForbidden, "Akses dashboard hanya untuk penyelenggara yang disetujui."
	case errors.Is(err, domain.ErrAccessDenied):
		status, msg = http.StatusForbidden, "Anda tidak berhak membuka antrean ini."
	case errors.Is(err, domain.ErrNotFound):
		status, msg = http.StatusNotFound, "Event tidak ditemukan."
	case errors.Is(err, domain.ErrTrendDisabled), errors.Is(err, domain.ErrSearchDisabled):
		status, msg = http.StatusNotFound, "Fitur ini belum diaktifkan."
	case errors.Is(err, domain.ErrRangeInvalid), errors.Is(err, domain.ErrCursorInvalid), errors.Is(err, domain.ErrRecLimitInvalid):
		status, msg = http.StatusBadRequest, "Filter laporan tidak valid."
	case errors.Is(err, domain.ErrExportRateLimited), errors.Is(err, domain.ErrRateLimited):
		status, msg = http.StatusTooManyRequests, "Terlalu banyak permintaan. Coba lagi nanti."
	case errors.Is(err, domain.ErrRecUnavailable), errors.Is(err, domain.ErrQueryFailed), errors.Is(err, domain.ErrExportFailed):
		status, msg = http.StatusServiceUnavailable, "Layanan laporan tidak tersedia."
	case errors.Is(err, authdomain.ErrForbidden):
		status, code, msg = http.StatusForbidden, domain.ErrAccessDenied.Error(), "Anda tidak berhak."
	}
	apierrors.Write(w, status, code, msg, id)
}
