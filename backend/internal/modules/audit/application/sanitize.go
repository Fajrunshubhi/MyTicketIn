package application

import (
	"encoding/json"
	"strings"
	"unicode/utf8"
)

const (
	maxStringRunes = 500
	maxJSONBytes   = 16 * 1024
)

var deniedNeedles = []string{
	"password", "secret", "token", "cookie", "authorization", "email",
}

func SanitizeMap(in map[string]any) (map[string]any, error) {
	if in == nil {
		return nil, nil
	}
	out, err := sanitizeValue(in)
	if err != nil {
		return nil, err
	}
	m, _ := out.(map[string]any)
	raw, err := json.Marshal(m)
	if err != nil {
		return nil, ErrWriteFailed
	}
	if len(raw) > maxJSONBytes {
		return nil, ErrWriteFailed
	}
	return m, nil
}

func sanitizeValue(v any) (any, error) {
	switch t := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(t))
		for k, val := range t {
			if deniedKey(k) {
				continue
			}
			sv, err := sanitizeValue(val)
			if err != nil {
				return nil, err
			}
			if sv != nil || val == nil {
				out[k] = sv
			}
		}
		return out, nil
	case []any:
		out := make([]any, 0, len(t))
		for _, item := range t {
			sv, err := sanitizeValue(item)
			if err != nil {
				return nil, err
			}
			out = append(out, sv)
		}
		return out, nil
	case string:
		return truncateRunes(t, maxStringRunes), nil
	default:
		return v, nil
	}
}

func deniedKey(key string) bool {
	lower := strings.ToLower(key)
	for _, n := range deniedNeedles {
		if lower == n || strings.Contains(lower, n) {
			return true
		}
	}
	return false
}

func truncateRunes(s string, max int) string {
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	runes := []rune(s)
	return string(runes[:max])
}
