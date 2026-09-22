package httpapi

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	eventapp "myticketin/internal/modules/events/application"
	"myticketin/internal/modules/events/domain"
	"myticketin/internal/platform/logger"
)

func (a API) catalogList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit := 12
	if raw := strings.TrimSpace(q.Get("limit")); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil {
			writeErr(w, r, domain.ErrCatalogQueryInvalid)
			return
		}
		limit = n
	}
	items, next, applied, err := a.Svc.ListPublicEvents(r.Context(), domain.CatalogQuery{
		Q: q.Get("q"), Category: q.Get("category"), City: q.Get("city"), Province: q.Get("province"), Tag: q.Get("tag"),
		DateFrom: q.Get("dateFrom"), DateTo: q.Get("dateTo"), Sort: domain.CatalogSort(q.Get("sort")),
		Cursor: q.Get("cursor"), Limit: limit,
	}, a.Auth.ClientIP(r), a.Secret)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writePublicJSON(w, http.StatusOK, 60, 300, map[string]any{
		"data": map[string]any{
			"items": items, "nextCursor": emptyToNil(next), "appliedFilters": eventapp.AppliedFilters(applied),
		},
		"correlationId": logger.CorrelationFrom(r.Context()),
	})
}

func (a API) catalogDetail(w http.ResponseWriter, r *http.Request) {
	ev, err := a.Svc.GetPublicEvent(r.Context(), chi.URLParam(r, "slug"), a.Auth.ClientIP(r))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writePublicJSON(w, http.StatusOK, 60, 300, map[string]any{
		"data":          map[string]any{"event": ev},
		"correlationId": logger.CorrelationFrom(r.Context()),
	})
}

func (a API) catalogFilters(w http.ResponseWriter, r *http.Request) {
	f, err := a.Svc.ListPublicFilters(r.Context(), a.Auth.ClientIP(r))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writePublicJSON(w, http.StatusOK, 300, 900, map[string]any{
		"data": map[string]any{
			"categories": f.Categories, "locations": f.Locations, "tags": f.Tags,
		},
		"correlationId": logger.CorrelationFrom(r.Context()),
	})
}

func (a API) catalogAI(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		writeErr(w, r, domain.ErrCatalogNaturalInvalid)
		return
	}
	var body struct {
		NaturalLanguage string `json:"naturalLanguage"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		writeErr(w, r, domain.ErrCatalogNaturalInvalid)
		return
	}
	out, err := a.Svc.ParseNaturalFilter(r.Context(), body.NaturalLanguage, a.Auth.ClientIP(r))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeData(w, r, http.StatusOK, out)
}

func emptyToNil(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func writePublicJSON(w http.ResponseWriter, status, sMaxAge, swr int, body any) {
	payload, _ := json.Marshal(body)
	sum := sha256.Sum256(payload)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, s-maxage="+strconv.Itoa(sMaxAge)+", stale-while-revalidate="+strconv.Itoa(swr))
	w.Header().Set("ETag", `"`+hex.EncodeToString(sum[:8])+`"`)
	w.WriteHeader(status)
	_, _ = w.Write(payload)
}
