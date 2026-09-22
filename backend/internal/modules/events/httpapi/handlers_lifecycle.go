package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	auditapp "myticketin/internal/modules/audit/application"
	auditdomain "myticketin/internal/modules/audit/domain"
	"myticketin/internal/modules/events/domain"
	"myticketin/internal/platform/logger"
)

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
	_ = json.NewDecoder(r.Body).Decode(&body)
	e, err := a.Svc.Resubmit(r.Context(), actor, chi.URLParam(r, "id"), body.ExpectedVersion)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{"id": e.ID, "status": e.Status, "submittedAt": e.SubmittedAt, "version": e.Version})
}

func (a API) requestCancel(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	req, err := a.Svc.RequestCancel(r.Context(), actor, chi.URLParam(r, "id"), body.Reason)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusAccepted, map[string]any{"request": req, "status": req.Status})
}

func (a API) cancelOrganizer(w http.ResponseWriter, r *http.Request) {
	a.requestCancel(w, r)
}

func (a API) cancelAdmin(w http.ResponseWriter, r *http.Request) {
	a.cancel(w, r, true)
}

func (a API) cancel(w http.ResponseWriter, r *http.Request, asAdmin bool) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	var body struct {
		Reason          string `json:"reason"`
		ExpectedVersion int    `json:"expectedVersion"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	e, err := a.Svc.Cancel(r.Context(), actor, chi.URLParam(r, "id"), body.Reason, body.ExpectedVersion, asAdmin)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{"id": e.ID, "status": e.Status, "cancelledAt": e.CancelledAt, "version": e.Version})
}

func (a API) complete(w http.ResponseWriter, r *http.Request) {
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
	e, err := a.Svc.Complete(r.Context(), actor, chi.URLParam(r, "id"), body.ExpectedVersion)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{"id": e.ID, "status": e.Status, "completedAt": e.CompletedAt, "version": e.Version})
}

func (a API) requestStopSales(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	req, err := a.Svc.RequestStopSales(r.Context(), actor, chi.URLParam(r, "id"), chi.URLParam(r, "ticketTypeId"), body.Reason)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusAccepted, map[string]any{"request": req, "status": req.Status})
}

func (a API) listLifecycleRequests(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	rows, err := a.Svc.ListPendingLifecycleRequests(r.Context(), actor)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if rows == nil {
		rows = []domain.LifecycleRequest{}
	}
	writeData(w, r, http.StatusOK, map[string]any{"items": rows})
}

func (a API) decideLifecycle(w http.ResponseWriter, r *http.Request) {
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
		Reason   string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	req, err := a.Svc.DecideLifecycleRequest(r.Context(), actor, chi.URLParam(r, "requestId"), body.Decision, body.Reason)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{"request": req})
}

func (a API) stopSales(w http.ResponseWriter, r *http.Request) {
	a.requestStopSales(w, r)
}

func (a API) listStaff(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	rows, err := a.Svc.ListStaff(r.Context(), actor, chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	items := make([]map[string]any, 0, len(rows))
	for _, arow := range rows {
		display := arow.UserID
		masked := "••••"
		if a.Svc.Users != nil {
			if u, err := a.Svc.Users.GetByID(r.Context(), arow.UserID); err == nil {
				display = u.Name
				masked = maskEmail(u.Email)
			}
		}
		items = append(items, map[string]any{
			"id": arow.ID, "userId": arow.UserID, "displayName": display, "maskedEmail": masked,
			"status": arow.Status, "version": arow.Version, "assignedAt": arow.AssignedAt.UTC().Format(time.RFC3339Nano),
		})
	}
	writeData(w, r, http.StatusOK, map[string]any{"items": items})
}

func (a API) assignStaff(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	var body struct {
		UserID                  string `json:"userId"`
		ExpectedExistingVersion int    `json:"expectedExistingVersion"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, r, domain.ErrStaffUserNotFound)
		return
	}
	asg, status, err := a.Svc.AssignStaff(r.Context(), actor, chi.URLParam(r, "id"), body.UserID, body.ExpectedExistingVersion)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, status, map[string]any{"assignment": asg})
}

func (a API) revokeStaff(w http.ResponseWriter, r *http.Request) {
	if err := a.Auth.RequireCSRF(r); err != nil {
		writeErr(w, r, err)
		return
	}
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	var body struct {
		Reason          string `json:"reason"`
		ExpectedVersion int    `json:"expectedVersion"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	asg, err := a.Svc.RevokeStaff(r.Context(), actor, chi.URLParam(r, "id"), chi.URLParam(r, "assignmentId"), body.Reason, body.ExpectedVersion)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{"assignment": asg})
}

func (a API) staffCandidates(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	users, err := a.Svc.SearchStaffCandidates(r.Context(), actor, r.URL.Query().Get("q"), a.Auth.ClientIP(r))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	items := make([]map[string]any, 0, len(users))
	for _, u := range users {
		items = append(items, map[string]any{"id": u.ID, "displayName": u.Name, "maskedEmail": maskEmail(u.Email)})
	}
	writeData(w, r, http.StatusOK, map[string]any{"items": items})
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
		cursorAt, cursorID = &t, id
	}
	rows, err := a.Svc.ListAdmin(r.Context(), actor, q.Get("status"), q.Get("q"), limit+1, cursorAt, cursorID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	var next string
	if len(rows) > limit {
		last := rows[limit-1]
		if last.SubmittedAt != nil {
			next = auditapp.EncodeCursor(a.Secret, *last.SubmittedAt, last.ID)
		}
		rows = rows[:limit]
	}
	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		submitted := ""
		if row.SubmittedAt != nil {
			submitted = row.SubmittedAt.UTC().Format(time.RFC3339Nano)
		}
		items = append(items, map[string]any{
			"id": row.ID, "title": row.Title, "organizerName": row.OrganizerName,
			"submittedAt": submitted, "version": row.Version, "status": row.Status,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"items": items, "nextCursor": next}, "correlationId": logger.CorrelationFrom(r.Context())})
}

func (a API) getAdmin(w http.ResponseWriter, r *http.Request) {
	actor, err := a.Auth.RequireUser(w, r)
	if err != nil {
		return
	}
	e, types, err := a.Svc.GetAdmin(r.Context(), actor, chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	var history []auditdomain.Summary
	if a.Audit != nil {
		history, _ = a.Audit.List(r.Context(), auditdomain.Filter{EntityType: "Event", EntityID: e.ID, Limit: 50})
	}
	hist := make([]map[string]any, 0, len(history))
	for _, h := range history {
		hist = append(hist, map[string]any{"id": h.ID, "occurredAt": h.OccurredAt.UTC().Format(time.RFC3339Nano), "action": h.Action, "outcome": h.Outcome})
	}
	writeData(w, r, http.StatusOK, map[string]any{
		"event": eventDTO(e), "ticketTypes": typesDTO(types), "image": nil, "auditSummary": hist, "version": e.Version,
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
	e, err := a.Svc.Moderate(r.Context(), actor, chi.URLParam(r, "id"), body.Decision, body.Reason, body.ExpectedVersion)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeData(w, r, http.StatusOK, map[string]any{
		"id": e.ID, "status": e.Status, "reason": e.ModerationReason, "decidedAt": e.DecidedAt, "publishedAt": e.PublishedAt, "version": e.Version,
	})
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
