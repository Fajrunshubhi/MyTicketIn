package logger

import (
	"context"
	"log/slog"
	"os"
	"strings"
)

type ctxKey struct{}

func New(service, appEnv string) *slog.Logger {
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level:       slog.LevelInfo,
		ReplaceAttr: RedactAttr,
	})
	return slog.New(handler).With("service", service, "env", appEnv)
}

func WithCorrelation(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, ctxKey{}, id)
}

func CorrelationFrom(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	id, _ := ctx.Value(ctxKey{}).(string)
	return id
}

func RedactAttr(_ []string, a slog.Attr) slog.Attr {
	key := strings.ToLower(a.Key)
	if isSensitiveKey(key) {
		return slog.String(a.Key, "[REDACTED]")
	}
	if a.Value.Kind() == slog.KindString && looksSecret(a.Value.String()) {
		return slog.String(a.Key, "[REDACTED]")
	}
	return a
}

func isSensitiveKey(key string) bool {
	needles := []string{
		"password", "passwd", "cookie", "authorization", "auth",
		"token", "secret", "dsn", "database_url", "connection_string",
		"connectionstring", "pepper", "prompt", "poster", "ocr",
		"qr", "session", "csrf", "ledger", "email", "phone",
	}
	for _, n := range needles {
		if key == n || strings.Contains(key, n) {
			return true
		}
	}
	return false
}

func looksSecret(value string) bool {
	lower := strings.ToLower(value)
	return strings.Contains(lower, "postgres://") ||
		strings.Contains(lower, "postgresql://") ||
		strings.Contains(lower, "password=") ||
		strings.Contains(lower, "bearer ") ||
		strings.HasPrefix(lower, "sk_live") ||
		strings.Contains(lower, "-----begin")
}
