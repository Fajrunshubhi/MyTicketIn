package errors

import "net/http"

type Category string

const (
	CatValidation     Category = "VALIDATION"
	CatAuthentication Category = "AUTHENTICATION"
	CatAuthorization  Category = "AUTHORIZATION"
	CatNotFound       Category = "NOT_FOUND"
	CatConflict       Category = "CONFLICT"
	CatRateLimit      Category = "RATE_LIMIT"
	CatProvider       Category = "PROVIDER"
	CatNetwork        Category = "NETWORK_CLIENT"
	CatInternal       Category = "INTERNAL"
)

type Entry struct {
	Code      string
	Category  Category
	Status    int
	Retryable bool
	Severity  string
	Owner     string
	Message   string
}

var catalog = map[string]Entry{
	CodeValidationError:            {CodeValidationError, CatValidation, http.StatusBadRequest, false, "low", "platform", "Data tidak valid. Periksa isian bertanda."},
	"AUTH_REQUIRED":                {"AUTH_REQUIRED", CatAuthentication, http.StatusUnauthorized, false, "medium", "auth", "Anda perlu masuk."},
	"SESSION_EXPIRED":              {"SESSION_EXPIRED", CatAuthentication, http.StatusUnauthorized, false, "medium", "auth", "Sesi telah berakhir. Masuk kembali."},
	"FORBIDDEN":                    {"FORBIDDEN", CatAuthorization, http.StatusForbidden, false, "medium", "auth", "Anda tidak memiliki akses."},
	"NOT_FOUND":                    {"NOT_FOUND", CatNotFound, http.StatusNotFound, false, "low", "platform", "Data tidak ditemukan."},
	"CONFLICT":                     {"CONFLICT", CatConflict, http.StatusConflict, true, "medium", "platform", "Data berubah. Muat ulang lalu coba lagi."},
	"INVENTORY_UNAVAILABLE":        {"INVENTORY_UNAVAILABLE", CatConflict, http.StatusConflict, true, "high", "orders", "Kuota tidak mencukupi. Muat ulang ketersediaan."},
	"SEAT_UNAVAILABLE":             {"SEAT_UNAVAILABLE", CatConflict, http.StatusConflict, true, "high", "orders", "Kursi tidak tersedia. Pilih kursi lain."},
	"RATE_LIMITED":                 {"RATE_LIMITED", CatRateLimit, http.StatusTooManyRequests, true, "medium", "platform", "Terlalu banyak permintaan. Coba lagi nanti."},
	"PASSWORD_RESET_RATE_LIMITED":  {"PASSWORD_RESET_RATE_LIMITED", CatRateLimit, http.StatusTooManyRequests, true, "medium", "auth", "Terlalu banyak permintaan pemulihan. Coba lagi nanti."},
	CodeServiceUnhealthy:           {CodeServiceUnhealthy, CatProvider, http.StatusServiceUnavailable, true, "high", "platform", "Layanan tidak siap. Coba lagi sebentar."},
	"EMAIL_PROVIDER_UNAVAILABLE":   {CodeEmailUnavailable, CatProvider, http.StatusServiceUnavailable, true, "high", "notifications", "Email sandbox tidak tersedia. Notifikasi in-app tetap dicoba."},
	"PAYMENT_PROVIDER_UNAVAILABLE": {"PAYMENT_PROVIDER_UNAVAILABLE", CatProvider, http.StatusBadGateway, true, "high", "payments", "Penyedia pembayaran sandbox tidak merespons. Cek status order, jangan ulangi bayar sebelum konfirmasi."},
	CodeInternalError:              {CodeInternalError, CatInternal, http.StatusInternalServerError, true, "critical", "platform", "Terjadi kesalahan internal."},
	CodeConfigInvalid:              {CodeConfigInvalid, CatInternal, http.StatusInternalServerError, false, "critical", "platform", "Konfigurasi layanan tidak valid."},
	CodeDatabaseUnavailable:        {CodeDatabaseUnavailable, CatProvider, http.StatusServiceUnavailable, true, "critical", "platform", "Layanan tidak siap."},
}

const CodeEmailUnavailable = "EMAIL_PROVIDER_UNAVAILABLE"

func Lookup(code string) (Entry, bool) {
	e, ok := catalog[code]
	return e, ok
}

func StatusFor(code string, fallback int) int {
	if e, ok := catalog[code]; ok {
		return e.Status
	}
	return fallback
}

func RetryAfterSeconds(status int, code string) int {
	if e, ok := catalog[code]; ok && e.Retryable && (status == http.StatusTooManyRequests || status == http.StatusServiceUnavailable || status == http.StatusBadGateway) {
		if status == http.StatusTooManyRequests {
			return 60
		}
		return 5
	}
	if status == http.StatusTooManyRequests {
		return 60
	}
	if status == http.StatusServiceUnavailable {
		return 5
	}
	return 0
}
