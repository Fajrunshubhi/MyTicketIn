package domain

import (
	"errors"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

type SaleStatus string
type CatalogSort string

const (
	SaleStopped    SaleStatus = "STOPPED"
	SaleNotStarted SaleStatus = "NOT_STARTED"
	SaleEnded      SaleStatus = "ENDED"
	SaleAvailable  SaleStatus = "AVAILABLE"

	SortSoonest CatalogSort = "soonest"
	SortNewest  CatalogSort = "newest"

	CatalogFilterTZ = "Asia/Jakarta"
	MaxCatalogQ     = 100
	MaxDateSpanDays = 366
	MaxNaturalRunes = 300
	MinNaturalRunes = 2
)

var (
	ErrCatalogQueryInvalid   = errors.New("CATALOG_QUERY_INVALID")
	ErrCatalogDateRange      = errors.New("CATALOG_DATE_RANGE_INVALID")
	ErrCatalogCursorInvalid  = errors.New("CATALOG_CURSOR_INVALID")
	ErrCatalogRateLimited    = errors.New("CATALOG_RATE_LIMITED")
	ErrCatalogUnavailable    = errors.New("CATALOG_UNAVAILABLE")
	ErrCatalogNaturalInvalid = errors.New("CATALOG_NATURAL_QUERY_INVALID")
)

type CatalogQuery struct {
	Q        string
	Category string
	City     string
	Province string
	Tag      string
	DateFrom string
	DateTo   string
	Sort     CatalogSort
	Cursor   string
	Limit    int
}

func CollapseSpace(s string) string {
	return strings.Join(strings.FieldsFunc(strings.TrimSpace(s), unicode.IsSpace), " ")
}

func NormalizeCatalogQuery(in CatalogQuery) (CatalogQuery, error) {
	out := CatalogQuery{
		Q:        CollapseSpace(in.Q),
		Category: strings.ToLower(strings.TrimSpace(in.Category)),
		City:     strings.ToLower(strings.TrimSpace(in.City)),
		Province: strings.ToLower(strings.TrimSpace(in.Province)),
		Tag:      strings.ToLower(strings.TrimSpace(in.Tag)),
		DateFrom: strings.TrimSpace(in.DateFrom),
		DateTo:   strings.TrimSpace(in.DateTo),
		Sort:     in.Sort,
		Cursor:   strings.TrimSpace(in.Cursor),
		Limit:    in.Limit,
	}
	if utf8.RuneCountInString(out.Q) > MaxCatalogQ {
		return CatalogQuery{}, ErrCatalogQueryInvalid
	}
	if out.Sort == "" {
		out.Sort = SortSoonest
	}
	if out.Sort != SortSoonest && out.Sort != SortNewest {
		return CatalogQuery{}, ErrCatalogQueryInvalid
	}
	if out.Limit <= 0 {
		out.Limit = 12
	}
	if out.Limit > 48 {
		return CatalogQuery{}, ErrCatalogQueryInvalid
	}
	if out.Tag != "" {
		tags, err := NormalizeTags([]string{out.Tag})
		if err != nil || len(tags) != 1 {
			return CatalogQuery{}, ErrCatalogQueryInvalid
		}
		out.Tag = tags[0]
	}
	if out.DateFrom != "" && out.DateTo == "" {
		out.DateTo = out.DateFrom
	}
	if out.DateTo != "" && out.DateFrom == "" {
		out.DateFrom = out.DateTo
	}
	if out.DateFrom != "" {
		from, err := time.Parse("2006-01-02", out.DateFrom)
		to, err2 := time.Parse("2006-01-02", out.DateTo)
		if err != nil || err2 != nil || to.Before(from) {
			return CatalogQuery{}, ErrCatalogDateRange
		}
		if to.Sub(from) > time.Duration(MaxDateSpanDays)*24*time.Hour {
			return CatalogQuery{}, ErrCatalogDateRange
		}
	}
	return out, nil
}

func JakartaDayBounds(dateFrom, dateTo string) (fromInclusive, toExclusive time.Time, err error) {
	loc, err := time.LoadLocation(CatalogFilterTZ)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	from, err := time.ParseInLocation("2006-01-02", dateFrom, loc)
	if err != nil {
		return time.Time{}, time.Time{}, ErrCatalogDateRange
	}
	to, err := time.ParseInLocation("2006-01-02", dateTo, loc)
	if err != nil {
		return time.Time{}, time.Time{}, ErrCatalogDateRange
	}
	return from, to.Add(24 * time.Hour), nil
}

func TicketSaleStatus(event Event, t TicketType, now time.Time) SaleStatus {
	if event.Status != StatusPublished || t.SalesStoppedAt != nil {
		return SaleStopped
	}
	if now.Before(t.SaleStartsAt) {
		return SaleNotStarted
	}
	if !now.Before(t.SaleEndsAt) || !now.Before(event.StartsAt) {
		return SaleEnded
	}
	return SaleAvailable
}

func EventListEligible(e Event, now time.Time) bool {
	return e.Status == StatusPublished && e.StartsAt.After(now)
}

func EventDetailEligible(e Event, now time.Time) bool {
	return e.Status == StatusPublished && e.EndsAt.After(now)
}

func NormalizeNaturalLanguage(raw string) (string, error) {
	s := CollapseSpace(raw)
	n := utf8.RuneCountInString(s)
	if n < MinNaturalRunes || n > MaxNaturalRunes {
		return "", ErrCatalogNaturalInvalid
	}
	return s, nil
}

func First100Runes(s string) string {
	if utf8.RuneCountInString(s) <= MaxCatalogQ {
		return s
	}
	r := []rune(s)
	return string(r[:MaxCatalogQ])
}

func FilterFingerprint(q CatalogQuery) string {
	return strings.Join([]string{q.Q, q.Category, q.City, q.Province, q.Tag, q.DateFrom, q.DateTo, string(q.Sort)}, "|")
}

type CatalogListRow struct {
	Event     Event
	PriceFrom *int64
}

type CatalogLocation struct {
	City     string `json:"city"`
	Province string `json:"province"`
}

type CatalogFilters struct {
	Categories []string          `json:"categories"`
	Locations  []CatalogLocation `json:"locations"`
	Tags       []string          `json:"tags"`
}
