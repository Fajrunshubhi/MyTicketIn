package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	auditapp "myticketin/internal/modules/audit/application"
	auditdomain "myticketin/internal/modules/audit/domain"
	authapp "myticketin/internal/modules/auth/application"
	authhttp "myticketin/internal/modules/auth/httpapi"
	orgapp "myticketin/internal/modules/organizers/application"
	"myticketin/internal/modules/organizers/domain"
	apierrors "myticketin/internal/platform/errors"
	"myticketin/internal/platform/logger"
)

type API struct {
	Auth   authhttp.API
	Svc    *orgapp.Service
	Audit  auditapp.WriterStore
	Secret string
}

func (a API) Mount(r chi.Router) {
	r.Post("/api/organizer/applications", a.submit)
	r.Get("/api/organizer/application", a.getOwn)
	r.Patch("/api/organizer/application", a.edit)
	r.Post("/api/organizer/application/resubmit", a.resubmit)
	r.Get("/api/organizer/capabilities", a.capabilities)
	r.Get("/api/admin/organizer-applications", a.listAdmin)
	r.Get("/api/admin/organizer-applications/{id}", a.getAdmin)
	r.Post("/api/admin/organizer-applications/{id}/decisions", a.decide)
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
		Name         string  `json:"name"`
		ContactEmail string  `json:"contactEmail"`
		ContactPhone *string `json:"contactPhone"`
		Description  string  `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, r, domain.ErrContactInvalid)
		return
	}
	phone := ""
	if body.ContactPhone != nil {
		phone = *body.ContactPhone
	}
	p, err := a.Svc.Submit(r.Context(), actor, body.Name, body.ContactEmail, phone, body.Description, a.Auth.ClientIP(r))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusCreated, ownerDTO(p))
}

func (a API) getOwn(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	p, err := a.Svc.GetOwn(r.Context(), actor)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeData(w, r, http.StatusOK, ownerDTO(p))
}

func (a API) edit(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	var body struct {
		Name            string  `json:"name"`
		ContactEmail    string  `json:"contactEmail"`
		ContactPhone    *string `json:"contactPhone"`
		Description     string  `json:"description"`
		ExpectedVersion int     `json:"expectedVersion"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, r, domain.ErrContactInvalid)
		return
	}
	phone := ""
	if body.ContactPhone != nil {
		phone = *body.ContactPhone
	}
	p, err := a.Svc.Edit(r.Context(), actor, body.Name, body.ContactEmail, phone, body.Description, body.ExpectedVersion)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, ownerDTO(p))
}

func (a API) resubmit(w http.ResponseWriter, r *http.Request) {
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
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, r, domain.ErrVersionConflict)
		return
	}
	p, err := a.Svc.Resubmit(r.Context(), actor, body.ExpectedVersion)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, ownerDTO(p))
}

func (a API) capabilities(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	id, status, can, err := a.Svc.Capabilities(r.Context(), actor)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeData(w, r, http.StatusOK, map[string]any{
		"organizerProfileId":          id,
		"status":                      status,
		"canManageOrganizerResources": can,
	})
}

func (a API) listAdmin(w http.ResponseWriter, r *http.Request) {
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
		cursorAt = &t
		cursorID = id
	}
	rows, err := a.Svc.ListAdmin(r.Context(), actor, q.Get("status"), q.Get("q"), limit+1, cursorAt, cursorID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	var next string
	if len(rows) > limit {
		last := rows[limit-1]
		next = auditapp.EncodeCursor(a.Secret, last.SubmittedAt, last.ID)
		rows = rows[:limit]
	}
	data := make([]map[string]any, 0, len(rows))
	for _, p := range rows {
		data = append(data, listDTO(p))
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeJSON(w, http.StatusOK, map[string]any{
		"data":          data,
		"page":          map[string]any{"nextCursor": next},
		"correlationId": logger.CorrelationFrom(r.Context()),
	})
}

func (a API) getAdmin(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	p, err := a.Svc.GetAdmin(r.Context(), actor, chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	var history []auditdomain.Summary
	if a.Audit != nil {
		history, _ = a.Audit.List(r.Context(), auditdomain.Filter{EntityType: "Organizer", EntityID: p.ID, Limit: 50})
	}
	hist := make([]map[string]any, 0, len(history))
	for _, h := range history {
		hist = append(hist, map[string]any{
			"id":         h.ID,
			"occurredAt": h.OccurredAt.UTC().Format(time.RFC3339Nano),
			"action":     h.Action,
			"outcome":    h.Outcome,
		})
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeData(w, r, http.StatusOK, map[string]any{
		"profile":      adminDetailDTO(p),
		"auditHistory": hist,
	})
}

func (a API) decide(w http.ResponseWriter, r *http.Request) {
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
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, r, domain.ErrTransitionInvalid)
		return
	}
	p, err := a.Svc.Decide(r.Context(), actor, chi.URLParam(r, "id"), domain.Decision(strings.ToUpper(body.Decision)), body.Reason, body.ExpectedVersion)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, ownerDTO(p))
}

func ownerDTO(p domain.Profile) map[string]any {
	return map[string]any{
		"id":             p.ID,
		"name":           p.Name,
		"contactEmail":   p.ContactEmail,
		"contactPhone":   p.ContactPhone,
		"description":    p.Description,
		"status":         p.Status,
		"decisionReason": p.DecisionReason,
		"submittedAt":    p.SubmittedAt.UTC().Format(time.RFC3339Nano),
		"version":        p.Version,
	}
}

func listDTO(p domain.Profile) map[string]any {
	return map[string]any{
		"id":          p.ID,
		"name":        p.Name,
		"status":      p.Status,
		"submittedAt": p.SubmittedAt.UTC().Format(time.RFC3339Nano),
		"contact":     maskEmail(p.ContactEmail),
		"version":     p.Version,
	}
}

func adminDetailDTO(p domain.Profile) map[string]any {
	d := ownerDTO(p)
	d["ownerUserId"] = maskID(p.OwnerUserID)
	d["decidedAt"] = nil
	if p.DecidedAt != nil {
		d["decidedAt"] = p.DecidedAt.UTC().Format(time.RFC3339Nano)
	}
	return d
}

func maskEmail(email string) string {
	parts := strings.Split(email, "@")
	if len(parts) != 2 || parts[0] == "" {
		return "••••"
	}
	local := parts[0]
	if len(local) == 1 {
		return "*@" + parts[1]
	}
	return string(local[0]) + "***@" + parts[1]
}

func maskID(id string) string {
	if len(id) <= 8 {
		return "••••"
	}
	return id[:4] + "…" + id[len(id)-4:]
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
	id := logger.CorrelationFrom(r.Context())
	code := err.Error()
	status := http.StatusBadRequest
	msg := "Permintaan organizer tidak valid."
	var ve authapp.ValidationError
	if errors.As(err, &ve) {
		apierrors.WriteFields(w, http.StatusBadRequest, "VALIDATION_ERROR", "Periksa kembali isian formulir.", id, ve.Fields)
		return
	}
	switch {
	case errors.Is(err, domain.ErrExists):
		status, msg = http.StatusConflict, "Pengajuan organizer sudah ada."
	case errors.Is(err, domain.ErrNotFound):
		status, msg = http.StatusNotFound, "Pengajuan organizer tidak ditemukan."
	case errors.Is(err, domain.ErrPending):
		status, msg = http.StatusConflict, "Pengajuan masih ditinjau."
	case errors.Is(err, domain.ErrAlreadyApproved):
		status, msg = http.StatusConflict, "Organizer sudah disetujui."
	case errors.Is(err, domain.ErrNotApproved):
		status, msg = http.StatusForbidden, "Organizer belum disetujui."
	case errors.Is(err, domain.ErrRequired):
		status, msg = http.StatusForbidden, "Profil organizer diperlukan."
	case errors.Is(err, domain.ErrTransitionInvalid):
		status, msg = http.StatusConflict, "Transisi status tidak valid."
		var te domain.TransitionError
		if errors.As(err, &te) {
			msg = domain.TransitionHint(te.From, te.Decision)
		}
	case errors.Is(err, domain.ErrVersionConflict), errors.Is(err, auditapp.ErrCursorInvalid):
		if errors.Is(err, auditapp.ErrCursorInvalid) {
			status, msg = http.StatusBadRequest, "Kursor halaman tidak valid."
		} else {
			status, msg = http.StatusConflict, "Data sudah berubah. Muat ulang halaman."
		}
	case errors.Is(err, domain.ErrReasonRequired):
		status, msg = http.StatusBadRequest, "Alasan keputusan wajib 10–1000 karakter."
	case errors.Is(err, domain.ErrContactInvalid):
		status, msg = http.StatusBadRequest, "Kontak organizer tidak valid."
	case errors.Is(err, domain.ErrRateLimited):
		status, msg = http.StatusTooManyRequests, "Terlalu banyak pengajuan. Coba lagi besok."
	case errors.Is(err, domain.ErrAccessDenied):
		status, msg = http.StatusForbidden, "Anda tidak memiliki akses."
	default:
		if code == "AUTH_FORBIDDEN" || code == "AUTH_CSRF_INVALID" {
			status, msg = http.StatusForbidden, "Anda tidak memiliki akses."
		} else if code == "AUDIT_WRITE_FAILED" {
			status, msg = http.StatusServiceUnavailable, "Pencatatan audit gagal."
		} else {
			status, code, msg = http.StatusInternalServerError, apierrors.CodeInternalError, "Terjadi kesalahan internal."
		}
	}
	apierrors.Write(w, status, code, msg, id)
}
