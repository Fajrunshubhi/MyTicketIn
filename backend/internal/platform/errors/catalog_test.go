package errors

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLookupRateLimitRetryAfter(t *testing.T) {
	e, ok := Lookup("RATE_LIMITED")
	if !ok || e.Category != CatRateLimit || e.Status != http.StatusTooManyRequests {
		t.Fatalf("%+v", e)
	}
	rr := httptest.NewRecorder()
	Write(rr, e.Status, e.Code, e.Message, "req_test01")
	if rr.Header().Get("Retry-After") == "" {
		t.Fatal("retry-after")
	}
	if !strings.Contains(rr.Body.String(), `"code":"RATE_LIMITED"`) {
		t.Fatal(rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), "goroutine") || strings.Contains(rr.Body.String(), "sql:") {
		t.Fatal("leaked internals")
	}
}

func TestInternalMessageGeneric(t *testing.T) {
	e, _ := Lookup(CodeInternalError)
	if !strings.Contains(e.Message, "kesalahan internal") {
		t.Fatal(e.Message)
	}
}
