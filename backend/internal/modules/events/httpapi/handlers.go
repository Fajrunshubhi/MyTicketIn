package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	auditapp "myticketin/internal/modules/audit/application"
	authapp "myticketin/internal/modules/auth/application"
	authhttp "myticketin/internal/modules/auth/httpapi"
	eventapp "myticketin/internal/modules/events/application"
	"myticketin/internal/modules/events/domain"
	apierrors "myticketin/internal/platform/errors"
	"myticketin/internal/platform/logger"
)

type API struct {
	Auth   authhttp.API
	Svc    *eventapp.Service
	Audit  auditapp.WriterStore
	Secret string
}

func (a API) Mount(r chi.Router) {
	r.Get("/api/events/filters", a.catalogFilters)
	r.Post("/api/events/ai-filter", a.catalogAI)
	r.Get("/api/events/{slug}", a.catalogDetail)
	r.Get("/api/events", a.catalogList)
	r.Post("/api/organizer/events", a.create)
	r.Get("/api/organizer/events", a.list)
	r.Get("/api/organizer/events/{id}", a.get)
	r.Patch("/api/organizer/events/{id}", a.update)
	r.Delete("/api/organizer/events/{id}", a.del)
	r.Post("/api/organizer/events/{id}/submit", a.submit)
	r.Post("/api/organizer/events/{id}/ticket-types", a.addTicket)
	r.Patch("/api/organizer/events/{id}/ticket-types/{ticketTypeId}", a.updateTicket)
	r.Delete("/api/organizer/events/{id}/ticket-types/{ticketTypeId}", a.deleteTicket)
	r.Put("/api/organizer/events/{id}/sections", a.putSections)
	r.Put("/api/organizer/events/{id}/seats", a.putSeats)
	r.Post("/api/organizer/events/{id}/seat-map", a.seatMap)
	r.Post("/api/organizer/events/{id}/images/upload-intents", a.storageUnavailable)
	r.Post("/api/organizer/events/{id}/images/{assetId}/finalize", a.storageUnavailable)
	r.Delete("/api/organizer/events/{id}/images/{assetId}", a.storageUnavailable)
	r.Post("/api/organizer/gallery-images", a.uploadGallery)
	r.Get("/uploads/gallery/{name}", a.serveGallery)
	r.Post("/api/organizer/events/{id}/ai/poster-suggestions", a.poster)
	r.Post("/api/organizer/events/{id}/resubmit", a.resubmit)
	r.Post("/api/organizer/events/{id}/cancel", a.requestCancel)
	r.Post("/api/organizer/events/{id}/complete", a.complete)
	r.Post("/api/organizer/events/{id}/ticket-types/{ticketTypeId}/stop-sales", a.requestStopSales)
	r.Get("/api/organizer/events/{id}/staff", a.listStaff)
	r.Post("/api/organizer/events/{id}/staff", a.assignStaff)
	r.Post("/api/organizer/events/{id}/staff/{assignmentId}/revoke", a.revokeStaff)
	r.Get("/api/organizer/staff-candidates", a.staffCandidates)
	r.Get("/api/admin/lifecycle-requests", a.listLifecycleRequests)
	r.Post("/api/admin/lifecycle-requests/{requestId}/decisions", a.decideLifecycle)
	r.Get("/api/admin/events", a.listAdmin)
	r.Get("/api/admin/events/{id}", a.getAdmin)
	r.Post("/api/admin/events/{id}/decisions", a.decide)
	r.Post("/api/admin/events/{id}/cancel", a.cancelAdmin)
}

func (a API) create(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	in, err := decodeEvent(r, true)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	e, err := a.Svc.Create(r.Context(), actor, in, a.Auth.ClientIP(r))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusCreated, map[string]any{"event": map[string]any{"id": e.ID, "slug": e.Slug, "status": e.Status, "version": e.Version}})
}

func (a API) list(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	q := r.URL.Query()
	limit, err := auditapp.ParseLimit(q.Get("limit"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	var cursorAt *time.Time
	cursorID := ""
	if c := q.Get("cursor"); c != "" {
		t, id, err := auditapp.DecodeCursor(a.Secret, c)
		if err != nil {
			writeErr(w, r, err)
			return
		}
		cursorAt, cursorID = &t, id
	}
	rows, err := a.Svc.List(r.Context(), actor, q.Get("status"), limit+1, cursorAt, cursorID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	var next string
	if len(rows) > limit {
		last := rows[limit-1]
		next = auditapp.EncodeCursor(a.Secret, last.UpdatedAt, last.ID)
		rows = rows[:limit]
	}
	items := make([]map[string]any, 0, len(rows))
	for _, e := range rows {
		items = append(items, eventDTO(e))
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"items": items, "nextCursor": next}, "correlationId": logger.CorrelationFrom(r.Context())})
}

func (a API) get(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	e, types, secs, seats, sm, err := a.Svc.Get(r.Context(), actor, chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	reqs, _ := a.Svc.ListEventLifecycleRequests(r.Context(), actor, e.ID)
	if secs == nil {
		secs = []domain.Section{}
	}
	if seats == nil {
		seats = []domain.Seat{}
	}
	writeData(w, r, http.StatusOK, map[string]any{
		"event": eventDTO(e), "ticketTypes": typesDTO(types), "sections": secs, "seats": seats, "seatMap": sm, "image": nil, "version": e.Version,
		"lifecycleRequests": reqs,
	})
}

func (a API) update(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	in, ver, err := decodeEventVersion(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	e, err := a.Svc.Update(r.Context(), actor, chi.URLParam(r, "id"), in, ver)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{"event": eventDTO(e), "version": e.Version})
}

func (a API) del(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	var body struct {
		ExpectedVersion int `json:"expectedVersion"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if err := a.Svc.Delete(r.Context(), actor, chi.URLParam(r, "id"), body.ExpectedVersion); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a API) submit(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	var body struct {
		ExpectedVersion int `json:"expectedVersion"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	e, err := a.Svc.Submit(r.Context(), actor, chi.URLParam(r, "id"), body.ExpectedVersion)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{"id": e.ID, "status": e.Status, "submittedAt": e.SubmittedAt, "version": e.Version})
}

func (a API) addTicket(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	in, _, err := decodeTicket(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	t, err := a.Svc.AddTicket(r.Context(), actor, chi.URLParam(r, "id"), in)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusCreated, ticketDTO(t))
}

func (a API) updateTicket(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	in, ver, err := decodeTicket(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	t, err := a.Svc.UpdateTicket(r.Context(), actor, chi.URLParam(r, "id"), chi.URLParam(r, "ticketTypeId"), in, ver)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, ticketDTO(t))
}

func (a API) deleteTicket(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	var body struct {
		ExpectedVersion int `json:"expectedVersion"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if err := a.Svc.DeleteTicket(r.Context(), actor, chi.URLParam(r, "id"), chi.URLParam(r, "ticketTypeId"), body.ExpectedVersion); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a API) putSections(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	var body struct {
		ExpectedVersion int              `json:"expectedVersion"`
		Sections        []domain.Section `json:"sections"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, r, domain.ErrIncomplete)
		return
	}
	if err := a.Svc.PutSections(r.Context(), actor, chi.URLParam(r, "id"), body.Sections, body.ExpectedVersion); err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{"ok": true})
}

func (a API) putSeats(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	var body struct {
		ExpectedVersion int           `json:"expectedVersion"`
		Seats           []domain.Seat `json:"seats"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, r, domain.ErrIncomplete)
		return
	}
	if err := a.Svc.PutSeats(r.Context(), actor, chi.URLParam(r, "id"), body.Seats, body.ExpectedVersion); err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{"ok": true})
}

func (a API) seatMap(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	var body struct {
		ExpectedVersion int    `json:"expectedVersion"`
		AltText         string `json:"altText"`
		Legend          string `json:"legend"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, r, domain.ErrStorageNotConfigured)
		return
	}
	if err := a.Svc.PutSeatMapMeta(r.Context(), actor, chi.URLParam(r, "id"), body.AltText, body.Legend, body.ExpectedVersion); err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{"placeholder": true})
}

var galleryFileRE = regexp.MustCompile(`^[a-f0-9]{32}\.(jpg|png|webp)$`)

func (a API) uploadGallery(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	if err := r.ParseMultipartForm(6 << 20); err != nil {
		writeErr(w, r, domain.ErrImageTypeInvalid)
		return
	}
	file, _, err := r.FormFile("image")
	if err != nil {
		writeErr(w, r, domain.ErrImageTypeInvalid)
		return
	}
	defer file.Close()
	b, err := io.ReadAll(io.LimitReader(file, 5<<20+1))
	if err != nil {
		writeErr(w, r, domain.ErrImageTypeInvalid)
		return
	}
	url, err := a.Svc.SaveGalleryImage(r.Context(), actor, b, a.Auth.ClientIP(r))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusCreated, map[string]any{"url": url})
}

func (a API) serveGallery(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if !galleryFileRE.MatchString(name) || a.Svc.GalleryDir == "" {
		http.NotFound(w, r)
		return
	}
	path := filepath.Join(a.Svc.GalleryDir, name)
	if _, err := os.Stat(path); err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeFile(w, r, path)
}

func (a API) storageUnavailable(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	if _, err := a.Auth.RequireUser(w, r); err != nil {
		return
	}
	writeErr(w, r, domain.ErrStorageNotConfigured)
}

func (a API) poster(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	if err := r.ParseMultipartForm(6 << 20); err != nil {
		writeErr(w, r, domain.ErrAIInputUnsupported)
		return
	}
	ver, _ := strconv.Atoi(r.FormValue("expectedEventVersion"))
	file, hdr, err := r.FormFile("poster")
	if err != nil {
		writeErr(w, r, domain.ErrAIInputUnsupported)
		return
	}
	defer file.Close()
	b, err := io.ReadAll(io.LimitReader(file, 5<<20+1))
	if err != nil {
		writeErr(w, r, domain.ErrAIInputUnsupported)
		return
	}
	res, err := a.Svc.SuggestFromPoster(r.Context(), actor, chi.URLParam(r, "id"), ver, hdr.Header.Get("Content-Type"), b)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, res)
}

func decodeEvent(r *http.Request, _ bool) (eventapp.EventInput, error) {
	in, _, err := decodeEventVersion(r)
	return in, err
}

func decodeEventVersion(r *http.Request) (eventapp.EventInput, int, error) {
	var body struct {
		Title           string `json:"title"`
		Description     string `json:"description"`
		Category        string `json:"category"`
		VenueName       string `json:"venueName"`
		AddressLine     string `json:"addressLine"`
		City            string    `json:"city"`
		Province        string    `json:"province"`
		Latitude        *float64  `json:"latitude"`
		Longitude       *float64  `json:"longitude"`
		Tags            []string  `json:"tags"`
		GalleryURLs     []string  `json:"galleryUrls"`
		Timezone        string    `json:"timezone"`
		StartsAt        string `json:"startsAt"`
		EndsAt          string `json:"endsAt"`
		Terms           string `json:"terms"`
		ContactEmail    string `json:"contactEmail"`
		ContactPhone    string `json:"contactPhone"`
		InventoryMode   string `json:"inventoryMode"`
		ExpectedVersion int    `json:"expectedVersion"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		return eventapp.EventInput{}, 0, domain.ErrIncomplete
	}
	st, err1 := time.Parse(time.RFC3339, body.StartsAt)
	en, err2 := time.Parse(time.RFC3339, body.EndsAt)
	if err1 != nil || err2 != nil {
		return eventapp.EventInput{}, 0, domain.ErrTimeInvalid
	}
	mode := domain.ModeGA
	if body.InventoryMode != "" {
		m, err := domain.ParseMode(body.InventoryMode)
		if err != nil {
			return eventapp.EventInput{}, 0, err
		}
		mode = m
	}
	return eventapp.EventInput{
		Title: body.Title, Description: body.Description, Category: body.Category, VenueName: body.VenueName,
		AddressLine: body.AddressLine, City: body.City, Province: body.Province, Latitude: body.Latitude, Longitude: body.Longitude, Tags: body.Tags, GalleryURLs: body.GalleryURLs, Timezone: body.Timezone,
		StartsAt: st, EndsAt: en, Terms: body.Terms, ContactEmail: body.ContactEmail, ContactPhone: body.ContactPhone,
		InventoryMode: mode,
	}, body.ExpectedVersion, nil
}

func decodeTicket(r *http.Request) (eventapp.TicketInput, int, error) {
	var body struct {
		Name            string `json:"name"`
		Description     string `json:"description"`
		PriceRupiah     int64  `json:"priceRupiah"`
		Quota           int    `json:"quota"`
		MaxPerAccount   int    `json:"maxPerAccount"`
		SaleStartsAt    string `json:"saleStartsAt"`
		SaleEndsAt      string `json:"saleEndsAt"`
		SortOrder       int    `json:"sortOrder"`
		ExpectedVersion int    `json:"expectedVersion"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		return eventapp.TicketInput{}, 0, domain.ErrTicketInvalid
	}
	st, err1 := time.Parse(time.RFC3339, body.SaleStartsAt)
	en, err2 := time.Parse(time.RFC3339, body.SaleEndsAt)
	if err1 != nil || err2 != nil {
		return eventapp.TicketInput{}, 0, domain.ErrTicketInvalid
	}
	if body.MaxPerAccount == 0 {
		body.MaxPerAccount = body.Quota
	}
	return eventapp.TicketInput{
		Name: body.Name, Description: body.Description, PriceRupiah: body.PriceRupiah, Quota: body.Quota,
		MaxPerAccount: body.MaxPerAccount, SaleStartsAt: st, SaleEndsAt: en, SortOrder: body.SortOrder,
	}, body.ExpectedVersion, nil
}

func eventDTO(e domain.Event) map[string]any {
	return map[string]any{
		"id": e.ID, "slug": e.Slug, "title": e.Title, "description": e.Description, "category": e.Category,
		"venueName": e.VenueName, "addressLine": e.AddressLine, "city": e.City, "province": e.Province,
		"latitude": e.Latitude, "longitude": e.Longitude, "tags": e.Tags, "galleryUrls": e.GalleryURLs,
		"timezone": e.Timezone, "startsAt": e.StartsAt.UTC().Format(time.RFC3339Nano), "endsAt": e.EndsAt.UTC().Format(time.RFC3339Nano),
		"terms": e.Terms, "contactEmail": e.ContactEmail, "contactPhone": e.ContactPhone, "status": e.Status,
		"inventoryMode": e.InventoryMode, "version": e.Version, "submittedAt": e.SubmittedAt,
		"moderationReason": e.ModerationReason, "decidedAt": e.DecidedAt, "publishedAt": e.PublishedAt,
		"cancelledAt": e.CancelledAt, "completedAt": e.CompletedAt, "cancellationReason": e.CancellationReason,
	}
}

func typesDTO(types []domain.TicketType) []map[string]any {
	out := make([]map[string]any, 0, len(types))
	for _, t := range types {
		out = append(out, ticketDTO(t))
	}
	return out
}

func ticketDTO(t domain.TicketType) map[string]any {
	remaining := t.Quota - t.ReservedQuantity - t.PaidQuantity
	if remaining < 0 {
		remaining = 0
	}
	return map[string]any{
		"id": t.ID, "name": t.Name, "description": t.Description, "priceRupiah": t.PriceRupiah, "quota": t.Quota,
		"maxPerAccount": t.MaxPerAccount, "saleStartsAt": t.SaleStartsAt.UTC().Format(time.RFC3339Nano),
		"saleEndsAt": t.SaleEndsAt.UTC().Format(time.RFC3339Nano), "sortOrder": t.SortOrder, "version": t.Version,
		"salesStoppedAt": t.SalesStoppedAt, "paidQuantity": t.PaidQuantity, "reservedQuantity": t.ReservedQuantity,
		"remaining": remaining,
	}
}

func writeData(w http.ResponseWriter, r *http.Request, status int, data any) {
	writeJSON(w, status, map[string]any{"data": data, "correlationId": logger.CorrelationFrom(r.Context())})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeErr(w http.ResponseWriter, r *http.Request, err error) {
	if err == nil {
		return
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return
	}
	if r != nil && r.Context().Err() != nil {
		return
	}
	id := logger.CorrelationFrom(r.Context())
	code := err.Error()
	status := http.StatusBadRequest
	msg := "Permintaan event tidak valid."
	var ve authapp.ValidationError
	if errors.As(err, &ve) {
		apierrors.WriteFields(w, http.StatusBadRequest, "VALIDATION_ERROR", "Periksa kembali isian formulir.", id, ve.Fields)
		return
	}
	switch {
	case errors.Is(err, domain.ErrNotFound):
		status, msg = http.StatusNotFound, "Event tidak ditemukan."
	case errors.Is(err, domain.ErrCatalogQueryInvalid):
		status, msg = http.StatusBadRequest, "Parameter katalog tidak valid."
		code = domain.ErrCatalogQueryInvalid.Error()
	case errors.Is(err, domain.ErrCatalogDateRange):
		status, msg = http.StatusBadRequest, "Rentang tanggal katalog tidak valid."
		code = domain.ErrCatalogDateRange.Error()
	case errors.Is(err, domain.ErrCatalogCursorInvalid):
		status, msg = http.StatusBadRequest, "Kursor halaman tidak valid."
		code = domain.ErrCatalogCursorInvalid.Error()
	case errors.Is(err, domain.ErrCatalogNaturalInvalid):
		status, msg = http.StatusBadRequest, "Teks pencarian alami tidak valid."
		code = domain.ErrCatalogNaturalInvalid.Error()
	case errors.Is(err, domain.ErrCatalogRateLimited):
		status, msg = http.StatusTooManyRequests, "Terlalu banyak permintaan katalog."
		code = domain.ErrCatalogRateLimited.Error()
	case errors.Is(err, domain.ErrCatalogUnavailable):
		status, msg = http.StatusServiceUnavailable, "Katalog sedang tidak tersedia."
		code = domain.ErrCatalogUnavailable.Error()
	case errors.Is(err, domain.ErrAccessDenied):
		status, msg = http.StatusForbidden, "Anda tidak memiliki akses organizer."
	case errors.Is(err, domain.ErrStatusInvalid):
		status, msg = http.StatusConflict, "Status event tidak mengizinkan aksi ini."
	case errors.Is(err, domain.ErrVersionConflict):
		status, msg = http.StatusConflict, "Data sudah berubah. Muat ulang halaman."
	case errors.Is(err, domain.ErrIncomplete):
		status, msg = http.StatusBadRequest, "Event belum lengkap untuk diajukan."
	case errors.Is(err, domain.ErrTimeInvalid):
		status, msg = http.StatusBadRequest, "Waktu event tidak valid."
	case errors.Is(err, domain.ErrSlugConflict):
		status, msg = http.StatusConflict, "Slug event bentrok. Coba judul lain."
	case errors.Is(err, domain.ErrTicketInvalid):
		status, msg = http.StatusBadRequest, "Jenis tiket tidak valid."
	case errors.Is(err, domain.ErrQuotaBelowSold):
		status, msg = http.StatusConflict, "Kuota tidak boleh kurang dari tiket yang sudah dibeli atau sedang dipesan."
	case errors.Is(err, domain.ErrTicketNameExists):
		status, msg = http.StatusConflict, "Nama jenis tiket sudah dipakai."
	case errors.Is(err, domain.ErrTicketRequired):
		status, msg = http.StatusBadRequest, "Minimal satu jenis tiket valid."
	case errors.Is(err, domain.ErrStorageNotConfigured):
		status, msg = http.StatusServiceUnavailable, "Penyimpanan gambar belum dikonfigurasi. Gunakan placeholder."
	case errors.Is(err, domain.ErrImageTypeInvalid), errors.Is(err, domain.ErrImageTooLarge):
		status, msg = http.StatusBadRequest, "Berkas gambar tidak didukung."
	case errors.Is(err, domain.ErrRateLimited):
		status, msg = http.StatusTooManyRequests, "Terlalu banyak permintaan."
	case errors.Is(err, domain.ErrModeMismatch):
		status, msg = http.StatusBadRequest, "Aksi tidak sesuai mode inventori."
	case errors.Is(err, domain.ErrAINotConfigured):
		status, msg = http.StatusServiceUnavailable, "Saran poster belum diaktifkan. Isi formulir secara manual."
	case errors.Is(err, domain.ErrAIRateLimited):
		status, msg = http.StatusTooManyRequests, "Batas saran poster tercapai."
	case errors.Is(err, domain.ErrAIInputUnsupported):
		status, msg = http.StatusUnprocessableEntity, "Poster tidak didukung."
	case errors.Is(err, domain.ErrAIOutputInvalid):
		status, msg = http.StatusBadGateway, "Saran poster tidak valid. Lanjutkan input manual."
	case errors.Is(err, domain.ErrTransitionInvalid):
		status, msg = http.StatusConflict, "Transisi status event tidak valid."
	case errors.Is(err, domain.ErrReasonRequired):
		status, msg = http.StatusBadRequest, "Alasan wajib diisi sesuai ketentuan."
	case errors.Is(err, domain.ErrNotEnded):
		status, msg = http.StatusConflict, "Event belum berakhir."
	case errors.Is(err, domain.ErrAlreadyCancelled):
		status, msg = http.StatusConflict, "Event sudah dibatalkan."
	case errors.Is(err, domain.ErrSalesAlreadyStopped):
		status, msg = http.StatusConflict, "Penjualan jenis tiket ini sudah dihentikan."
	case errors.Is(err, domain.ErrStaffUserNotFound):
		status, msg = http.StatusNotFound, "Pengguna tidak ditemukan."
	case errors.Is(err, domain.ErrStaffUserInactive):
		status, msg = http.StatusConflict, "Pengguna tidak aktif."
	case errors.Is(err, domain.ErrStaffConflict):
		status, msg = http.StatusConflict, "Penugasan petugas bentrok."
	case errors.Is(err, domain.ErrStaffNotFound):
		status, msg = http.StatusNotFound, "Penugasan tidak ditemukan."
	case errors.Is(err, domain.ErrStaffAccessDenied):
		status, msg = http.StatusForbidden, "Petugas tidak dapat ditugaskan."
	case errors.Is(err, domain.ErrLifecyclePending):
		status, msg = http.StatusConflict, "Pengajuan serupa masih menunggu konfirmasi admin."
	case errors.Is(err, domain.ErrLifecycleNotFound):
		status, msg = http.StatusNotFound, "Pengajuan tidak ditemukan."
	case errors.Is(err, domain.ErrLifecycleDecided):
		status, msg = http.StatusConflict, "Pengajuan sudah diputuskan."
	default:
		if strings.HasPrefix(code, "AUTH_") {
			status, msg = http.StatusForbidden, "Anda tidak memiliki akses."
		} else {
			status, code, msg = http.StatusInternalServerError, apierrors.CodeInternalError, "Terjadi kesalahan internal."
			slog.Error("unmapped event error", "correlationId", id, "err", err.Error())
		}
	}
	apierrors.Write(w, status, code, msg, id)
}
