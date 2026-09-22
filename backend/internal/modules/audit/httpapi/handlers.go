package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	auditapp "myticketin/internal/modules/audit/application"
	"myticketin/internal/modules/audit/domain"
	authdomain "myticketin/internal/modules/auth/domain"
	authhttp "myticketin/internal/modules/auth/httpapi"
	apierrors "myticketin/internal/platform/errors"
	"myticketin/internal/platform/logger"
)

type API struct {
	Auth  authhttp.API
	Query *auditapp.QueryService
}

func (a API) Mount(r chi.Router) {
	r.Get("/api/admin/audit-logs", a.list)
	r.Get("/api/admin/audit-logs/{id}", a.detail)
}

func (a API) list(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	if err := a.Auth.Svc.AdminAudit(r.Context(), actor); err != nil {
		writeErr(w, r, err)
		return
	}
	q := r.URL.Query()
	limit, err := auditapp.ParseLimit(q.Get("limit"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	from, err := auditapp.ParseTime(q.Get("from"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	to, err := auditapp.ParseTime(q.Get("to"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	rows, next, err := a.Query.List(r.Context(), domain.Filter{
		Action:      q.Get("action"),
		EntityType:  q.Get("entityType"),
		EntityID:    q.Get("entityId"),
		ActorUserID: q.Get("actorUserId"),
		Outcome:     q.Get("outcome"),
		From:        from,
		To:          to,
		Limit:       limit,
	}, q.Get("cursor"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	data := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		data = append(data, summaryDTO(row))
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeJSON(w, http.StatusOK, map[string]any{
		"data":          data,
		"page":          map[string]any{"nextCursor": next},
		"correlationId": logger.CorrelationFrom(r.Context()),
	})
}

func (a API) detail(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	if err := a.Auth.Svc.AdminAudit(r.Context(), actor); err != nil {
		writeErr(w, r, err)
		return
	}
	d, err := a.Query.Get(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeJSON(w, http.StatusOK, map[string]any{
		"data":          detailDTO(d),
		"correlationId": logger.CorrelationFrom(r.Context()),
	})
}

func summaryDTO(row domain.Summary) map[string]any {
	return map[string]any{
		"id":            row.ID,
		"occurredAt":    row.OccurredAt.UTC().Format(time.RFC3339Nano),
		"actorType":     row.ActorType,
		"actorUserId":   row.ActorUserID,
		"action":        row.Action,
		"entityType":    row.EntityType,
		"entityId":      row.EntityID,
		"outcome":       row.Outcome,
		"reasonCode":    row.ReasonCode,
		"correlationId": row.CorrelationID,
		"schemaVersion": row.SchemaVersion,
	}
}

func detailDTO(d domain.Detail) map[string]any {
	m := summaryDTO(d.Summary)
	m["before"] = d.Before
	m["after"] = d.After
	m["metadata"] = d.Metadata
	return m
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
	msg := "Permintaan tidak valid."
	switch {
	case errors.Is(err, auditapp.ErrNotFound):
		status, msg = http.StatusNotFound, "Catatan audit tidak ditemukan."
	case errors.Is(err, auditapp.ErrFilterInvalid):
		status, msg = http.StatusBadRequest, "Filter audit tidak valid."
	case errors.Is(err, auditapp.ErrCursorInvalid):
		status, msg = http.StatusBadRequest, "Kursor halaman tidak valid."
	case errors.Is(err, authdomain.ErrForbidden):
		status, msg = http.StatusForbidden, "Anda tidak memiliki akses."
		code = authdomain.ErrForbidden.Error()
	default:
		status, code, msg = http.StatusInternalServerError, apierrors.CodeInternalError, "Terjadi kesalahan internal."
	}
	apierrors.Write(w, status, code, msg, id)
}
