package application

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"
	"unicode/utf8"

	authdomain "myticketin/internal/modules/auth/domain"
	"myticketin/internal/modules/events/domain"
)

const suggestionSchema = "event-poster-suggestion.v1"

var allowedSuggestionFields = map[string]struct{}{
	"title": {}, "description": {}, "category": {}, "venueName": {}, "addressLine": {},
	"city": {}, "province": {}, "timezone": {}, "startsAt": {}, "endsAt": {},
	"terms": {}, "contactEmail": {}, "contactPhone": {}, "ticketTypes": {},
}

type FieldSuggestion struct {
	Field      string `json:"field"`
	Value      string `json:"value"`
	Confidence string `json:"confidence"`
}

type AmbiguousField struct {
	Field      string `json:"field"`
	ReasonCode string `json:"reasonCode"`
}

type SuggestionResult struct {
	SchemaVersion   string            `json:"schemaVersion"`
	Suggestions     []FieldSuggestion `json:"suggestions"`
	MissingFields   []string          `json:"missingFields"`
	AmbiguousFields []AmbiguousField  `json:"ambiguousFields"`
	Disclaimer      string            `json:"disclaimer"`
}

type PosterSuggester interface {
	Suggest(ctx context.Context, mime string, image []byte) (SuggestionResult, error)
}

type DisabledAI struct{}

func (DisabledAI) Suggest(context.Context, string, []byte) (SuggestionResult, error) {
	return SuggestionResult{}, domain.ErrAINotConfigured
}

type FakeAI struct{}

func (FakeAI) Suggest(_ context.Context, mime string, image []byte) (SuggestionResult, error) {
	sum := sha256.Sum256(image)
	key := hex.EncodeToString(sum[:8])
	_ = mime
	if bytes.Contains(image, []byte("IGNORE")) || bytes.Contains(image, []byte("abaikan")) {
		return SuggestionResult{}, domain.ErrAIOutputInvalid
	}
	_ = key
	return SuggestionResult{
		SchemaVersion: suggestionSchema,
		Suggestions: []FieldSuggestion{
			{Field: "title", Value: "Konser Uji Poster", Confidence: "HIGH"},
			{Field: "category", Value: "Musik", Confidence: "MEDIUM"},
			{Field: "timezone", Value: "Asia/Jakarta", Confidence: "HIGH"},
		},
		MissingFields:   []string{"contactEmail", "terms"},
		AmbiguousFields: []AmbiguousField{{Field: "startsAt", ReasonCode: "INCOMPLETE_DATE"}},
		Disclaimer:      "Saran AI belum disimpan. Pilih field lalu simpan draft secara manual.",
	}, nil
}

func DetectImageMIME(b []byte) (string, error) {
	if len(b) < 12 {
		return "", domain.ErrAIInputUnsupported
	}
	if b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF {
		return "image/jpeg", nil
	}
	if bytes.HasPrefix(b, []byte{0x89, 0x50, 0x4E, 0x47}) {
		return "image/png", nil
	}
	if bytes.HasPrefix(b, []byte("RIFF")) && bytes.Equal(b[8:12], []byte("WEBP")) {
		return "image/webp", nil
	}
	return "", domain.ErrAIInputUnsupported
}

func (s *Service) SuggestFromPoster(ctx context.Context, actor authdomain.User, eventID string, expectedVersion int, mime string, image []byte) (SuggestionResult, error) {
	e, _, err := s.owned(ctx, actor, eventID)
	if err != nil {
		return SuggestionResult{}, err
	}
	if !domain.Suggestable(e.Status) {
		return SuggestionResult{}, domain.ErrStatusInvalid
	}
	if e.Version != expectedVersion {
		return SuggestionResult{}, domain.ErrVersionConflict
	}
	if len(image) == 0 || len(image) > 5*1024*1024 {
		return SuggestionResult{}, domain.ErrImageTooLarge
	}
	got, err := DetectImageMIME(image)
	if err != nil {
		return SuggestionResult{}, err
	}
	if mime != "" && mime != got && mime != "image/jpg" {
		return SuggestionResult{}, domain.ErrImageTypeInvalid
	}
	if err := s.limit(ctx, "ai", actor.ID, actor.ID, 20, 24*time.Hour); err != nil {
		if err == domain.ErrRateLimited {
			return SuggestionResult{}, domain.ErrAIRateLimited
		}
		return SuggestionResult{}, err
	}
	if s.AI == nil {
		return SuggestionResult{}, domain.ErrAINotConfigured
	}
	raw, err := s.AI.Suggest(ctx, got, image)
	if err != nil {
		return SuggestionResult{}, err
	}
	return sanitizeSuggestions(raw)
}

func sanitizeSuggestions(in SuggestionResult) (SuggestionResult, error) {
	out := SuggestionResult{
		SchemaVersion: suggestionSchema,
		Disclaimer:    "Saran AI belum disimpan. Pilih field lalu simpan draft secara manual.",
	}
	if in.SchemaVersion != "" && in.SchemaVersion != suggestionSchema {
		return SuggestionResult{}, domain.ErrAIOutputInvalid
	}
	seen := map[string]struct{}{}
	for _, sg := range in.Suggestions {
		if _, ok := allowedSuggestionFields[sg.Field]; !ok {
			return SuggestionResult{}, domain.ErrAIOutputInvalid
		}
		if sg.Confidence != "HIGH" && sg.Confidence != "MEDIUM" && sg.Confidence != "LOW" {
			return SuggestionResult{}, domain.ErrAIOutputInvalid
		}
		val := strings.TrimSpace(sg.Value)
		if val == "" || utf8.RuneCountInString(val) > 10000 {
			continue
		}
		if strings.ContainsAny(val, "<>") || strings.Contains(strings.ToLower(val), "javascript:") {
			return SuggestionResult{}, domain.ErrAIOutputInvalid
		}
		if _, ok := seen[sg.Field]; ok {
			continue
		}
		seen[sg.Field] = struct{}{}
		out.Suggestions = append(out.Suggestions, FieldSuggestion{Field: sg.Field, Value: val, Confidence: sg.Confidence})
	}
	for _, f := range in.MissingFields {
		if _, ok := allowedSuggestionFields[f]; ok {
			out.MissingFields = append(out.MissingFields, f)
		}
	}
	for _, a := range in.AmbiguousFields {
		switch a.ReasonCode {
		case "MULTIPLE_VALUES", "UNREADABLE", "INCOMPLETE_DATE", "MISSING_TIMEZONE", "UNSUPPORTED_FORMAT":
			out.AmbiguousFields = append(out.AmbiguousFields, a)
		default:
			return SuggestionResult{}, domain.ErrAIOutputInvalid
		}
	}
	return out, nil
}
