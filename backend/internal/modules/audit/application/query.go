package application

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"strconv"
	"strings"
	"time"

	"myticketin/internal/modules/audit/domain"
)

type QueryService struct {
	Store  WriterStore
	Secret string
}

func (q *QueryService) Get(ctx context.Context, id string) (domain.Detail, error) {
	if strings.TrimSpace(id) == "" {
		return domain.Detail{}, ErrNotFound
	}
	d, err := q.Store.Get(ctx, id)
	if err != nil {
		return domain.Detail{}, ErrNotFound
	}
	return d, nil
}

func (q *QueryService) List(ctx context.Context, f domain.Filter, cursor string) ([]domain.Summary, string, error) {
	pageSize := f.Limit
	if pageSize <= 0 {
		pageSize = 25
	}
	if pageSize > 100 {
		return nil, "", ErrFilterInvalid
	}
	if f.Outcome != "" && f.Outcome != "SUCCESS" && f.Outcome != "REJECTED" && f.Outcome != "FAILED" {
		return nil, "", ErrFilterInvalid
	}
	if cursor != "" {
		t, id, err := DecodeCursor(q.Secret, cursor)
		if err != nil {
			return nil, "", err
		}
		f.CursorTime = &t
		f.CursorID = id
	}
	f.Limit = pageSize + 1
	rows, err := q.Store.List(ctx, f)
	if err != nil {
		return nil, "", err
	}
	var next string
	if len(rows) > pageSize {
		last := rows[pageSize-1]
		next = EncodeCursor(q.Secret, last.OccurredAt, last.ID)
		rows = rows[:pageSize]
	}
	return rows, next, nil
}

func EncodeCursor(secret string, occurredAt time.Time, id string) string {
	raw := occurredAt.UTC().Format(time.RFC3339Nano) + "|" + id
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(raw))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil)) + "." + base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func DecodeCursor(secret, token string) (time.Time, string, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return time.Time{}, "", ErrCursorInvalid
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return time.Time{}, "", ErrCursorInvalid
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return time.Time{}, "", ErrCursorInvalid
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(raw)
	if !hmac.Equal(sig, mac.Sum(nil)) {
		return time.Time{}, "", ErrCursorInvalid
	}
	split := strings.SplitN(string(raw), "|", 2)
	if len(split) != 2 {
		return time.Time{}, "", ErrCursorInvalid
	}
	t, err := time.Parse(time.RFC3339Nano, split[0])
	if err != nil {
		return time.Time{}, "", ErrCursorInvalid
	}
	if split[1] == "" {
		return time.Time{}, "", ErrCursorInvalid
	}
	return t, split[1], nil
}

func ParseLimit(raw string) (int, error) {
	if raw == "" {
		return 25, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 || n > 100 {
		return 0, ErrFilterInvalid
	}
	return n, nil
}

func ParseTime(raw string) (*time.Time, error) {
	if raw == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return nil, ErrFilterInvalid
	}
	utc := t.UTC()
	return &utc, nil
}
