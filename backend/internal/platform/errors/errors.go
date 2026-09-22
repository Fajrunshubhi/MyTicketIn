package errors

import (
	"encoding/json"
	"net/http"
	"strconv"
)

const (
	CodeConfigInvalid       = "CONFIG_INVALID"
	CodeDatabaseUnavailable = "DATABASE_UNAVAILABLE"
	CodeServiceUnhealthy    = "SERVICE_UNHEALTHY"
	CodeValidationError     = "VALIDATION_ERROR"
	CodeInternalError       = "INTERNAL_ERROR"
)

type Body struct {
	Error Detail `json:"error"`
}

type Detail struct {
	Code          string            `json:"code"`
	Message       string            `json:"message"`
	CorrelationID string            `json:"correlationId"`
	FieldErrors   map[string]string `json:"fieldErrors"`
}

func Write(w http.ResponseWriter, status int, code, message, correlationID string) {
	WriteFields(w, status, code, message, correlationID, nil)
}

func WriteFields(w http.ResponseWriter, status int, code, message, correlationID string, fields map[string]string) {
	if correlationID == "" {
		correlationID = "req_unavailable"
	}
	if fields == nil {
		fields = map[string]string{}
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-store")
	if n := RetryAfterSeconds(status, code); n > 0 {
		w.Header().Set("Retry-After", strconv.Itoa(n))
	}
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Body{Error: Detail{
		Code:          code,
		Message:       message,
		CorrelationID: correlationID,
		FieldErrors:   fields,
	}})
}
