package application

import (
	"context"
	"strings"

	"myticketin/internal/modules/events/domain"
)

type FakeCatalogAI struct{}

func (FakeCatalogAI) ParseCatalogFilter(_ context.Context, naturalLanguage, _, _, _ string, categories []string, locations []domain.CatalogLocation) (map[string]any, error) {
	lower := strings.ToLower(naturalLanguage)
	if strings.Contains(lower, "status") || strings.Contains(lower, "select ") || strings.Contains(lower, "insert ") || strings.Contains(lower, "<script") {
		return nil, domain.ErrAIOutputInvalid
	}
	out := map[string]any{"sort": "soonest"}
	if strings.Contains(lower, "bandung") {
		out["city"] = "bandung"
	}
	if strings.Contains(lower, "musik") || strings.Contains(lower, "konser") {
		out["category"] = "musik"
	}
	if strings.Contains(lower, "jazz") {
		out["q"] = "jazz"
	}
	_ = categories
	_ = locations
	return out, nil
}
