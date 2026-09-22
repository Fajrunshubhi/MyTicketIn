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
	orderdomain "myticketin/internal/modules/orders/domain"
	payapp "myticketin/internal/modules/payments/application"
	"myticketin/internal/modules/payments/domain"
	apierrors "myticketin/internal/platform/errors"
	"myticketin/internal/platform/logger"
)

type API struct {
	Auth authhttp.API
	Svc  *payapp.Service
}

func (a API) Mount(r chi.Router) {
	r.Post("/api/orders/{orderId}/payment", a.create)
	r.Get("/api/orders/{orderId}/payment", a.get)
	r.Post("/api/orders/{orderId}/payment/sandbox-settle", a.settle)
	r.Post("/api/webhooks/payments/{provider}", a.webhook)
	r.Get("/api/admin/payment-reconciliations", a.listRecon)
	r.Post("/api/admin/payment-reconciliations/{id}/resolve", a.resolve)
	r.Post("/api/admin/refunds", a.createRefund)
	r.Post("/api/admin/refunds/{id}/decision", a.decideRefund)
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
	var body struct {
		Method string `json:"method"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<12)).Decode(&body); err != nil {
		writeErr(w, r, domain.ErrMalformed)
		return
	}
	view, replay, err := a.Svc.Create(r.Context(), actor, chi.URLParam(r, "orderId"), body.Method, strings.TrimSpace(r.Header.Get("Idempotency-Key")), a.Auth.ClientIP(r))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	status := http.StatusCreated
	if replay {
		status = http.StatusOK
	}
	writeData(w, r, status, map[string]any{"payment": view, "loyalty": view.Loyalty})
}

func (a API) get(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	view, err := a.Svc.Get(r.Context(), actor, chi.URLParam(r, "orderId"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{"payment": view})
}

func (a API) settle(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	if err := a.Svc.SandboxSettle(r.Context(), actor, chi.URLParam(r, "orderId")); err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{"received": true, "sandbox": true, "message": "Konfirmasi sedang diproses"})
}

func (a API) webhook(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, 256*1024+1))
	if err != nil {
		writeErr(w, r, domain.ErrMalformed)
		return
	}
	if len(raw) > 256*1024 {
		writeErr(w, r, domain.ErrMalformed)
		return
	}
	headers := map[string]string{}
	for k, v := range r.Header {
		if len(v) > 0 {
			headers[k] = v[0]
		}
	}
	out := a.Svc.ProcessWebhook(r.Context(), chi.URLParam(r, "provider"), raw, headers)
	if out.Err != nil && out.HTTP >= 400 {
		writeErr(w, r, out.Err)
		return
	}
	if out.HTTP == 202 {
		w.Header().Set("Retry-After", "1")
		writeData(w, r, http.StatusAccepted, map[string]any{"received": true})
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{"received": true})
}

func (a API) listRecon(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	items, next, err := a.Svc.ListRecon(r.Context(), actor, r.URL.Query().Get("status"), limit, r.URL.Query().Get("cursor"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	rows := make([]map[string]any, 0, len(items))
	for _, it := range items {
		ref := ""
		rows = append(rows, map[string]any{
			"id": it.ID, "orderNumber": it.OrderNumber, "paymentId": it.PaymentID,
			"reasonCode": it.ReasonCode, "providerReferenceMasked": ref, "createdAt": it.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
			"status": it.Status,
		})
	}
	writeData(w, r, http.StatusOK, map[string]any{"items": rows, "nextCursor": next})
}

func (a API) resolve(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	var body struct {
		Decision string `json:"decision"`
		Notes    string `json:"notes"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<14)).Decode(&body); err != nil {
		writeErr(w, r, domain.ErrMalformed)
		return
	}
	rec, err := a.Svc.ResolveRecon(r.Context(), actor, chi.URLParam(r, "id"), body.Decision, body.Notes)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{"reconciliation": rec, "sandbox": true})
}

func (a API) createRefund(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	var body struct {
		OrderID      string `json:"orderId"`
		AmountRupiah int64  `json:"amountRupiah"`
		Reason       string `json:"reason"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<14)).Decode(&body); err != nil {
		writeErr(w, r, domain.ErrMalformed)
		return
	}
	rf, _, err := a.Svc.RequestRefund(r.Context(), actor, body.OrderID, body.AmountRupiah, body.Reason, strings.TrimSpace(r.Header.Get("Idempotency-Key")), a.Auth.ClientIP(r))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusCreated, map[string]any{"refund": map[string]any{
		"id": rf.ID, "refundNumber": rf.RefundNumber, "status": rf.Status, "amountRupiah": rf.AmountRupiah, "sandbox": true, "cashValue": false,
	}})
}

func (a API) decideRefund(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	var body struct {
		Decision        string `json:"decision"`
		Reason          string `json:"reason"`
		ExpectedVersion int    `json:"expectedVersion"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<14)).Decode(&body); err != nil {
		writeErr(w, r, domain.ErrMalformed)
		return
	}
	rf, err := a.Svc.DecideRefund(r.Context(), actor, chi.URLParam(r, "id"), body.Decision, body.Reason, body.ExpectedVersion)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{"refund": map[string]any{"id": rf.ID, "status": rf.Status, "sandbox": true}})
}

func writeData(w http.ResponseWriter, r *http.Request, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"data": data, "correlationId": logger.CorrelationFrom(r.Context())})
}

func writeErr(w http.ResponseWriter, r *http.Request, err error) {
	id := logger.CorrelationFrom(r.Context())
	status, code, msg := http.StatusBadRequest, err.Error(), "Pembayaran sandbox tidak dapat diproses."
	switch {
	case errors.Is(err, authdomain.ErrCSRFInvalid):
		status, code, msg = http.StatusForbidden, authdomain.ErrCSRFInvalid.Error(), "Sesi formulir tidak valid. Muat ulang halaman."
	case errors.Is(err, authdomain.ErrForbidden):
		status, code, msg = http.StatusForbidden, authdomain.ErrForbidden.Error(), "Anda tidak berhak melakukan aksi ini."
	case errors.Is(err, domain.ErrNotFound), errors.Is(err, orderdomain.ErrNotFound):
		status, msg = http.StatusNotFound, "Pembayaran tidak ditemukan."
	case errors.Is(err, domain.ErrSignatureInvalid):
		status, msg = http.StatusUnauthorized, "Tanda tangan webhook tidak valid."
	case errors.Is(err, domain.ErrEventCollision):
		status, msg = http.StatusConflict, "Event webhook bentrok."
	case errors.Is(err, domain.ErrNotAllowed):
		status, msg = http.StatusConflict, "Order ini tidak dapat dibayar."
	case errors.Is(err, domain.ErrKeyRequired), errors.Is(err, orderdomain.ErrKeyRequired):
		status, msg = http.StatusBadRequest, "Header Idempotency-Key wajib diisi."
	case errors.Is(err, domain.ErrKeyReused):
		status, msg = http.StatusConflict, "Kunci idempotensi sudah dipakai untuk permintaan berbeda."
	case errors.Is(err, domain.ErrKeyInProgress):
		status, msg = http.StatusConflict, "Permintaan masih diproses."
	case errors.Is(err, domain.ErrRateLimited):
		status, msg = http.StatusTooManyRequests, "Terlalu banyak permintaan. Coba lagi nanti."
	case errors.Is(err, domain.ErrRefundAmount):
		status, msg = http.StatusConflict, "Nominal refund tidak valid."
	case errors.Is(err, domain.ErrRefundNotAllowed):
		status, msg = http.StatusConflict, "Refund tidak diizinkan."
	case errors.Is(err, domain.ErrFulfillmentBlocked):
		status, msg = http.StatusConflict, "Refund ditolak karena tiket sudah digunakan."
	case errors.Is(err, domain.ErrMalformed):
		status, msg = http.StatusBadRequest, "Payload webhook tidak valid."
	}
	apierrors.Write(w, status, code, msg, id)
}
