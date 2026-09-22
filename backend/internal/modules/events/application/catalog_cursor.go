package application

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"strings"
	"time"

	"myticketin/internal/modules/events/domain"
)

func catalogFilterHash(q domain.CatalogQuery) string {
	sum := sha256.Sum256([]byte(domain.FilterFingerprint(q)))
	return hex.EncodeToString(sum[:16])
}

func EncodeCatalogCursor(secret string, q domain.CatalogQuery, sortAt time.Time, id string) string {
	raw := "v1|" + string(q.Sort) + "|" + id + "|" + sortAt.UTC().Format(time.RFC3339Nano) + "|" + catalogFilterHash(q)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(raw))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil)) + "." + base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func DecodeCatalogCursor(secret string, q domain.CatalogQuery, token string) (time.Time, string, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return time.Time{}, "", domain.ErrCatalogCursorInvalid
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return time.Time{}, "", domain.ErrCatalogCursorInvalid
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return time.Time{}, "", domain.ErrCatalogCursorInvalid
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(raw)
	if !hmac.Equal(sig, mac.Sum(nil)) {
		return time.Time{}, "", domain.ErrCatalogCursorInvalid
	}
	fields := strings.Split(string(raw), "|")
	if len(fields) != 5 || fields[0] != "v1" || fields[1] != string(q.Sort) || fields[4] != catalogFilterHash(q) {
		return time.Time{}, "", domain.ErrCatalogCursorInvalid
	}
	t, err := time.Parse(time.RFC3339Nano, fields[3])
	if err != nil || fields[2] == "" {
		return time.Time{}, "", domain.ErrCatalogCursorInvalid
	}
	return t, fields[2], nil
}
