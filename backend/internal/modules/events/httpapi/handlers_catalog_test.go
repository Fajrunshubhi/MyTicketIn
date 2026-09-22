package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCatalogListEmptyAndMissingDetail(t *testing.T) {
	h, _ := testHandler(t)
	req := httptest.NewRequest(http.MethodGet, "/api/events", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Header().Get("Cache-Control"), "s-maxage=60") {
		t.Fatalf("cache %s", rec.Header().Get("Cache-Control"))
	}
	if !strings.Contains(rec.Body.String(), `"items"`) {
		t.Fatalf("body %s", rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/events/slug-tidak-ada", nil)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("detail %d %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/events/filters", nil)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("filters %d %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/events/ai-filter", strings.NewReader(`{"naturalLanguage":"x"}`))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("ai %d %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/events/ai-filter", strings.NewReader(`{"naturalLanguage":"konser jazz di Bandung"}`))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "BASIC_SEARCH_FALLBACK") {
		t.Fatalf("ai fallback %d %s", rec.Code, rec.Body.String())
	}
}

func TestCatalogRejectsOversizedQuery(t *testing.T) {
	h, _ := testHandler(t)
	q := strings.Repeat("a", 101)
	req := httptest.NewRequest(http.MethodGet, "/api/events?q="+q, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}
