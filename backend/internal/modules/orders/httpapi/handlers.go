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
	loyaltydomain "myticketin/internal/modules/loyalty/domain"
	orderapp "myticketin/internal/modules/orders/application"
	"myticketin/internal/modules/orders/domain"
	apierrors "myticketin/internal/platform/errors"
	"myticketin/internal/platform/logger"
)

type API struct {
	Auth            authhttp.API
	Svc             *orderapp.Service
	SchedulerSecret string
}

func (a API) Mount(r chi.Router) {
	r.Post("/api/checkout/summary", a.summary)
	r.Post("/api/orders", a.create)
	r.Get("/api/orders/{id}", a.get)
	r.Get("/api/orders", a.list)
	r.Get("/api/loyalty/accounts/{organizerProfileId}", a.loyalty)
	r.Post("/api/internal/jobs/expire-orders", a.expire)
}

func (a API) summary(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	in, err := decodeCheckout(r, false)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	out, err := a.Svc.Summarize(r.Context(), actor, in, a.Auth.ClientIP(r))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, out)
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
	in, err := decodeCheckout(r, true)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	view, replay, err := a.Svc.Create(r.Context(), actor, in, strings.TrimSpace(r.Header.Get("Idempotency-Key")), a.Auth.ClientIP(r))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	status := http.StatusCreated
	if replay {
		status = http.StatusOK
	}
	writeData(w, r, status, map[string]any{"order": view})
}

func (a API) get(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	view, err := a.Svc.Get(r.Context(), actor, chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{"order": view})
}

func (a API) list(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	items, next, err := a.Svc.List(r.Context(), actor, r.URL.Query().Get("cursor"), limit)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{"items": items, "nextCursor": next})
}

func (a API) loyalty(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	out, err := a.Svc.LoyaltyAccount(r.Context(), actor, chi.URLParam(r, "organizerProfileId"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, out)
}

func (a API) expire(w http.ResponseWriter, r *http.Request) {
	if !secretOK(a.SchedulerSecret, r.Header.Get("X-Scheduler-Secret")) {
		writeErr(w, r, domain.ErrJobUnauthorized)
		return
	}
	var body struct {
		BatchSize int `json:"batchSize"`
	}
	_ = json.NewDecoder(io.LimitReader(r.Body, 1<<12)).Decode(&body)
	out, err := a.Svc.ExpireDue(r.Context(), body.BatchSize)
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

func decodeCheckout(r *http.Request, requireConfirm bool) (domain.CheckoutInput, error) {
	var in domain.CheckoutInput
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&in); err != nil {
		return domain.CheckoutInput{}, domain.ErrCheckoutInvalid
	}
	if requireConfirm && !in.Confirmed {
		return domain.CheckoutInput{}, domain.ErrCheckoutInvalid
	}
	return in, nil
}

func writeData(w http.ResponseWriter, r *http.Request, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"data": data, "correlationId": logger.CorrelationFrom(r.Context())})
}

func writeErr(w http.ResponseWriter, r *http.Request, err error) {
	id := logger.CorrelationFrom(r.Context())
	status, code, msg := http.StatusBadRequest, err.Error(), "Checkout tidak dapat diproses."
	switch {
	case errors.Is(err, authdomain.ErrCSRFInvalid):
		status, code, msg = http.StatusForbidden, authdomain.ErrCSRFInvalid.Error(), "Sesi formulir tidak valid. Muat ulang halaman."
	case errors.Is(err, authdomain.ErrForbidden):
		status, code, msg = http.StatusForbidden, authdomain.ErrForbidden.Error(), "Anda tidak berhak melakukan checkout."
	case errors.Is(err, domain.ErrCheckoutInvalid):
		status, msg = http.StatusBadRequest, "Data checkout tidak valid."
	case errors.Is(err, domain.ErrKeyRequired):
		status, msg = http.StatusBadRequest, "Header Idempotency-Key wajib diisi."
	case errors.Is(err, domain.ErrKeyReused):
		status, msg = http.StatusConflict, "Kunci idempotensi sudah dipakai untuk permintaan berbeda."
	case errors.Is(err, domain.ErrKeyInProgress):
		w.Header().Set("Retry-After", "1")
		status, msg = http.StatusConflict, "Checkout masih diproses. Coba lagi sebentar."
	case errors.Is(err, domain.ErrNotPurchasable):
		status, msg = http.StatusConflict, "Event ini tidak dapat dibeli."
	case errors.Is(err, domain.ErrSaleNotActive):
		status, msg = http.StatusConflict, "Penjualan tiket sedang tidak aktif."
	case errors.Is(err, domain.ErrPurchaseLimit):
		status, msg = http.StatusConflict, "Jumlah tiket melebihi sisa kuota."
	case errors.Is(err, domain.ErrAttendeeDuplicate):
		status, msg = http.StatusConflict, "Setiap tiket wajib biodata pemegang yang berbeda (NIK unik)."
	case errors.Is(err, domain.ErrInventory):
		status, msg = http.StatusConflict, "Kuota tiket tidak mencukupi."
	case errors.Is(err, domain.ErrSeatUnavailable):
		status, msg = http.StatusConflict, "Kursi yang dipilih sudah tidak tersedia."
	case errors.Is(err, domain.ErrModeMismatch):
		status, msg = http.StatusConflict, "Pilihan tiket tidak sesuai mode inventori event."
	case errors.Is(err, domain.ErrNotFound):
		status, msg = http.StatusNotFound, "Order tidak ditemukan."
	case errors.Is(err, domain.ErrJobUnauthorized):
		status, msg = http.StatusUnauthorized, "Job scheduler tidak terotorisasi."
	case errors.Is(err, domain.ErrRateLimited):
		status, msg = http.StatusTooManyRequests, "Terlalu banyak permintaan. Coba lagi nanti."
	case errors.Is(err, loyaltydomain.ErrInsufficient):
		status, msg = http.StatusConflict, "Poin loyalty tidak mencukupi."
	case errors.Is(err, loyaltydomain.ErrRedemptionLimit):
		status, msg = http.StatusConflict, "Penukaran poin melebihi batas 20% subtotal."
	case errors.Is(err, domain.ErrConflict):
		status, msg = http.StatusConflict, "Order tidak dapat disimpan karena konflik data."
	case errors.Is(err, domain.ErrPriceChanged):
		status, msg = http.StatusConflict, "Harga tiket berubah. Muat ulang halaman."
	case errors.Is(err, loyaltydomain.ErrOrganizerMismatch):
		status, msg = http.StatusConflict, "Poin loyalty hanya berlaku untuk organizer event ini."
	}
	apierrors.Write(w, status, code, msg, id)
}
