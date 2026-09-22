package application

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/url"
	"strconv"
	"strings"
	"time"

	analyticsapp "myticketin/internal/modules/analytics/application"
	"myticketin/internal/modules/events/domain"
)

type CatalogListRow = domain.CatalogListRow
type CatalogLocation = domain.CatalogLocation
type CatalogFilters = domain.CatalogFilters

type PublicImage struct {
	URL string `json:"url"`
	Alt string `json:"alt"`
}

type PublicTicket struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Description   string `json:"description,omitempty"`
	PriceRupiah   int64  `json:"priceRupiah"`
	Quota         int    `json:"quota"`
	SaleStartsAt  string `json:"saleStartsAt"`
	SaleEndsAt    string `json:"saleEndsAt"`
	MaxPerAccount int    `json:"maxPerAccount"`
	SaleStatus    string `json:"saleStatus"`
	Remaining     int    `json:"remaining"`
	StockLabel    string `json:"stockLabel"`
}

type PublicEvent struct {
	ID                     string           `json:"id"`
	Slug                   string           `json:"slug"`
	Title                  string           `json:"title"`
	Description            string           `json:"description"`
	Category               string           `json:"category"`
	Organizer              map[string]any   `json:"organizer"`
	VenueName              string           `json:"venueName"`
	AddressLine            string           `json:"addressLine"`
	City                   string           `json:"city"`
	Province               string           `json:"province"`
	Latitude               *float64         `json:"latitude,omitempty"`
	Longitude              *float64         `json:"longitude,omitempty"`
	Tags                   []string         `json:"tags"`
	Timezone               string           `json:"timezone"`
	StartsAt               string           `json:"startsAt"`
	EndsAt                 string           `json:"endsAt"`
	Terms                  string           `json:"terms"`
	ContactEmail           string           `json:"contactEmail"`
	ContactPhone           *string          `json:"contactPhone,omitempty"`
	InventoryMode          string           `json:"inventoryMode"`
	Image                  PublicImage      `json:"image"`
	Images                 []PublicImage    `json:"images"`
	SeatMap                any              `json:"seatMap"`
	Sections               []map[string]any `json:"sections"`
	Seats                  []map[string]any `json:"seats"`
	TicketTypes            []PublicTicket   `json:"ticketTypes"`
	AvailabilityDisclaimer string           `json:"availabilityDisclaimer"`
}

type CatalogCard struct {
	Slug            string      `json:"slug"`
	Title           string      `json:"title"`
	Category        string      `json:"category"`
	City            string      `json:"city"`
	StartsAt        string      `json:"startsAt"`
	Timezone        string      `json:"timezone"`
	Image           PublicImage `json:"image"`
	PriceFromRupiah *int64      `json:"priceFromRupiah"`
	SaleStatus      string      `json:"saleStatus"`
}

type CatalogParser interface {
	ParseCatalogFilter(ctx context.Context, naturalLanguage, locale, today, timezone string, categories []string, locations []CatalogLocation) (map[string]any, error)
}

const (
	catalogDisclaimer = "Label stok bersifat informatif. Kuota dan hold 15 menit dipastikan ulang saat checkout."
	placeholderAlt    = "Placeholder gambar event"
)

func placeholderImage() PublicImage {
	return PublicImage{URL: "/placeholder-event.svg", Alt: placeholderAlt}
}

func eventCover(e domain.Event) PublicImage {
	for _, raw := range e.GalleryURLs {
		u := strings.TrimSpace(raw)
		if u != "" {
			return PublicImage{URL: u, Alt: e.Title}
		}
	}
	if u := dummyCoverURL(e); u != "" {
		return PublicImage{URL: u, Alt: e.Title}
	}
	return placeholderImage()
}

func dummyCoverURL(e domain.Event) string {
	blob := strings.ToLower(strings.TrimSpace(e.Category) + " " + e.Title)
	switch {
	case strings.Contains(blob, "film") || strings.Contains(blob, "teater") || strings.Contains(blob, "pameran") || strings.Contains(blob, "seni"):
		return "/dummy-events/theater-1.jpg"
	case strings.Contains(blob, "lari") || strings.Contains(blob, "run") || strings.Contains(blob, "olahraga"):
		return "/dummy-events/run-jakarta.jpg"
	case strings.Contains(blob, "kuliner") || strings.Contains(blob, "food") || strings.Contains(blob, "festival"):
		return "/dummy-events/food-1.jpg"
	case strings.Contains(blob, "seminar") || strings.Contains(blob, "summit") || strings.Contains(blob, "konferensi"):
		return "/dummy-events/summit-1.jpg"
	case strings.Contains(blob, "musik") || strings.Contains(blob, "jazz") || strings.Contains(blob, "konser"):
		return "/dummy-events/jazz-1.jpg"
	default:
		return "/dummy-events/jazz-1.jpg"
	}
}

func (s *Service) catalogLimit(ctx context.Context, ip, scope string, max int, window time.Duration) error {
	if s.Rates == nil || s.HashKey == nil || ip == "" {
		return nil
	}
	if s.RelaxedLimits && max < 2000 {
		max = 2000
	}
	n, err := s.Rates.Hit(ctx, s.HashKey("catalog|"+scope+"|"+ip), scope, window)
	if err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		slog.Warn("catalog rate limiter unavailable", "scope", scope, "err", err.Error())
		return nil
	}
	if n > max {
		return domain.ErrCatalogRateLimited
	}
	return nil
}

func (s *Service) ListPublicEvents(ctx context.Context, in domain.CatalogQuery, ip, secret string) ([]CatalogCard, string, domain.CatalogQuery, error) {
	q, err := domain.NormalizeCatalogQuery(in)
	if err != nil {
		return nil, "", domain.CatalogQuery{}, err
	}
	max := 120
	scope := "catalog"
	if q.Q != "" {
		max, scope = 60, "catalog-search"
	}
	if err := s.catalogLimit(ctx, ip, scope, max, time.Hour); err != nil {
		return nil, "", domain.CatalogQuery{}, err
	}
	now := s.Now()
	var cursorAt *time.Time
	cursorID := ""
	if q.Cursor != "" {
		t, id, err := DecodeCatalogCursor(secret, q, q.Cursor)
		if err != nil {
			return nil, "", domain.CatalogQuery{}, err
		}
		cursorAt, cursorID = &t, id
	}
	rows, err := s.Store.ListCatalog(ctx, q, now, q.Limit+1, cursorAt, cursorID)
	if err != nil {
		if ctx.Err() != nil {
			return nil, "", domain.CatalogQuery{}, ctx.Err()
		}
		slog.Error("catalog list failed", "err", err.Error())
		return nil, "", domain.CatalogQuery{}, domain.ErrCatalogUnavailable
	}
	var next string
	if len(rows) > q.Limit {
		last := rows[q.Limit-1]
		sortAt := last.Event.StartsAt
		if q.Sort == domain.SortNewest && last.Event.PublishedAt != nil {
			sortAt = *last.Event.PublishedAt
		}
		next = EncodeCatalogCursor(secret, q, sortAt, last.Event.ID)
		rows = rows[:q.Limit]
	}
	cards := make([]CatalogCard, 0, len(rows))
	for _, row := range rows {
		status := domain.SaleStopped
		types, err := s.Store.ListTickets(ctx, row.Event.ID)
		if err == nil {
			status = listSaleStatus(row.Event, types, now)
			if row.PriceFrom == nil {
				row.PriceFrom = priceFrom(row.Event, types, now)
			}
		}
		cards = append(cards, CatalogCard{
			Slug:            row.Event.Slug,
			Title:           row.Event.Title,
			Category:        row.Event.Category,
			City:            row.Event.City,
			StartsAt:        row.Event.StartsAt.UTC().Format(time.RFC3339),
			Timezone:        row.Event.Timezone,
			Image:           eventCover(row.Event),
			PriceFromRupiah: row.PriceFrom,
			SaleStatus:      string(status),
		})
	}
	name := "catalog_viewed"
	if q.Q != "" {
		name = "event_search_performed"
	}
	s.emitCatalog(ctx, name, len(cards))
	return cards, next, q, nil
}

func listSaleStatus(e domain.Event, types []domain.TicketType, now time.Time) domain.SaleStatus {
	hasAvail := false
	hasNotStarted := false
	for _, t := range types {
		switch domain.TicketSaleStatus(e, t, now) {
		case domain.SaleAvailable:
			hasAvail = true
		case domain.SaleNotStarted:
			hasNotStarted = true
		}
	}
	if hasAvail {
		return domain.SaleAvailable
	}
	if hasNotStarted {
		return domain.SaleNotStarted
	}
	if len(types) == 0 {
		return domain.SaleStopped
	}
	return domain.SaleEnded
}

func priceFrom(e domain.Event, types []domain.TicketType, now time.Time) *int64 {
	var eligible *int64
	var all *int64
	for _, t := range types {
		p := t.PriceRupiah
		if all == nil || p < *all {
			all = &p
		}
		if domain.TicketSaleStatus(e, t, now) == domain.SaleAvailable {
			cp := p
			if eligible == nil || cp < *eligible {
				eligible = &cp
			}
		}
	}
	if eligible != nil {
		return eligible
	}
	return all
}

func (s *Service) GetPublicEvent(ctx context.Context, slug, ip string) (PublicEvent, error) {
	if err := s.catalogLimit(ctx, ip, "catalog-detail", 180, time.Hour); err != nil {
		return PublicEvent{}, err
	}
	slug = strings.TrimSpace(strings.ToLower(slug))
	if slug == "" {
		return PublicEvent{}, domain.ErrNotFound
	}
	e, err := s.Store.GetEventBySlug(ctx, slug)
	if err != nil {
		return PublicEvent{}, domain.ErrNotFound
	}
	now := s.Now()
	if !domain.EventDetailEligible(e, now) {
		return PublicEvent{}, domain.ErrNotFound
	}
	types, err := s.Store.ListTickets(ctx, e.ID)
	if err != nil {
		return PublicEvent{}, domain.ErrCatalogUnavailable
	}
	secs, _ := s.Store.ListSections(ctx, e.ID)
	seats, _ := s.Store.ListSeats(ctx, e.ID)
	sm, _ := s.Store.GetSeatMap(ctx, e.ID)
	orgName := ""
	if s.Profiles != nil {
		if p, err := s.Profiles.GetByID(ctx, e.OrganizerProfileID); err == nil {
			orgName = p.Name
		}
	}
	tickets := make([]PublicTicket, 0, len(types))
	for _, t := range types {
		desc := ""
		if t.Description != nil {
			desc = *t.Description
		}
		remaining := t.Quota - t.ReservedQuantity - t.PaidQuantity
		if remaining < 0 {
			remaining = 0
		}
		stock := "AVAILABLE"
		if remaining == 0 {
			stock = "SOLD_OUT"
		} else if remaining <= 5 || (t.Quota > 0 && remaining*10 <= t.Quota) {
			stock = "LOW"
		}
		tickets = append(tickets, PublicTicket{
			ID: t.ID, Name: t.Name, Description: desc, PriceRupiah: t.PriceRupiah, Quota: t.Quota,
			SaleStartsAt: t.SaleStartsAt.UTC().Format(time.RFC3339), SaleEndsAt: t.SaleEndsAt.UTC().Format(time.RFC3339),
			MaxPerAccount: t.MaxPerAccount, SaleStatus: string(domain.TicketSaleStatus(e, t, now)),
			Remaining: remaining, StockLabel: stock,
		})
	}
	sectionDTO := make([]map[string]any, 0, len(secs))
	for _, sec := range secs {
		sectionDTO = append(sectionDTO, map[string]any{"id": sec.ID, "name": sec.Name, "ticketTypeId": sec.TicketTypeID})
	}
	held := map[string]struct{}{}
	if s.Holds != nil {
		if ids, err := s.Holds.ListHeldSeatIDs(ctx, e.ID); err == nil {
			for _, id := range ids {
				held[id] = struct{}{}
			}
		}
	}
	seatDTO := make([]map[string]any, 0, len(seats))
	for _, seat := range seats {
		st := string(listSaleStatus(e, types, now))
		if _, ok := held[seat.ID]; ok {
			st = "UNAVAILABLE"
		}
		seatDTO = append(seatDTO, map[string]any{"id": seat.ID, "sectionId": seat.SectionID, "label": seat.Label, "saleStatus": st})
	}
	var seatMap any
	if sm.ID != "" && sm.Status == domain.ImageReady {
		seatMap = map[string]any{"url": "/placeholder-event.svg", "altText": sm.AltText, "legend": sm.Legend}
	} else if e.InventoryMode == domain.ModeReserved {
		seatMap = map[string]any{"url": "/placeholder-event.svg", "altText": "Denah venue belum tersedia", "legend": "Denah statis akan tampil setelah diunggah organizer."}
	}
	if e.Tags == nil {
		e.Tags = []string{}
	}
	gallery := make([]PublicImage, 0, len(e.GalleryURLs)+1)
	for i, raw := range e.GalleryURLs {
		alt := e.Title
		if i > 0 {
			alt = e.Title + " — " + strconv.Itoa(i+1)
		}
		gallery = append(gallery, PublicImage{URL: raw, Alt: alt})
	}
	if len(gallery) == 0 {
		gallery = []PublicImage{eventCover(e)}
	}
	out := PublicEvent{
		ID: e.ID, Slug: e.Slug, Title: e.Title, Description: e.Description, Category: e.Category,
		Organizer: map[string]any{"id": e.OrganizerProfileID, "name": orgName}, VenueName: e.VenueName, AddressLine: e.AddressLine,
		City: e.City, Province: e.Province, Latitude: e.Latitude, Longitude: e.Longitude, Tags: e.Tags, Timezone: e.Timezone,
		StartsAt: e.StartsAt.UTC().Format(time.RFC3339), EndsAt: e.EndsAt.UTC().Format(time.RFC3339),
		Terms: e.Terms, ContactEmail: e.ContactEmail, ContactPhone: e.ContactPhone,
		InventoryMode: string(e.InventoryMode), Image: gallery[0], Images: gallery, SeatMap: seatMap,
		Sections: sectionDTO, Seats: seatDTO, TicketTypes: tickets, AvailabilityDisclaimer: catalogDisclaimer,
	}
	s.emitCatalog(ctx, "event_viewed", 1)
	return out, nil
}

func (s *Service) ListPublicFilters(ctx context.Context, ip string) (CatalogFilters, error) {
	if err := s.catalogLimit(ctx, ip, "catalog-filters", 120, time.Hour); err != nil {
		return CatalogFilters{}, err
	}
	f, err := s.Store.ListCatalogFilters(ctx, s.Now())
	if err != nil {
		if ctx.Err() != nil {
			return CatalogFilters{}, ctx.Err()
		}
		slog.Error("catalog filters failed", "err", err.Error())
		return CatalogFilters{}, domain.ErrCatalogUnavailable
	}
	return f, nil
}

type NaturalFilterResult struct {
	Mode           string         `json:"mode"`
	FilterDTO      map[string]any `json:"filterDto"`
	Chips          []FilterChip   `json:"chips"`
	CanonicalQuery string         `json:"canonicalQuery"`
	Notice         string         `json:"notice,omitempty"`
}

type FilterChip struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Value string `json:"value"`
}

func (s *Service) ParseNaturalFilter(ctx context.Context, raw, ip string) (NaturalFilterResult, error) {
	normalized, err := domain.NormalizeNaturalLanguage(raw)
	if err != nil {
		return NaturalFilterResult{}, err
	}
	if err := s.catalogLimit(ctx, ip, "catalog-ai-min", 10, time.Minute); err != nil {
		return s.basicSearchFallback(normalized), nil
	}
	if err := s.catalogLimit(ctx, ip, "catalog-ai-day", 50, 24*time.Hour); err != nil {
		return s.basicSearchFallback(normalized), nil
	}
	filters, ferr := s.Store.ListCatalogFilters(ctx, s.Now())
	if ferr != nil {
		return NaturalFilterResult{}, domain.ErrCatalogUnavailable
	}
	today := s.Now().In(mustJakarta()).Format("2006-01-02")
	if s.CatalogAI != nil {
		draft, perr := s.CatalogAI.ParseCatalogFilter(ctx, normalized, "id-ID", today, domain.CatalogFilterTZ, filters.Categories, filters.Locations)
		if perr == nil {
			dto, nerr := normalizeFilterDraft(draft, filters)
			if nerr == nil {
				s.emitCatalog(ctx, "catalog_natural_filter_parsed", 0)
				return NaturalFilterResult{Mode: "AI", FilterDTO: dto, Chips: chipsFromDTO(dto), CanonicalQuery: canonicalQuery(dto)}, nil
			}
		}
	}
	out := s.basicSearchFallback(normalized)
	s.emitCatalog(ctx, "catalog_natural_filter_fallback", 0)
	return out, nil
}

func (s *Service) basicSearchFallback(normalized string) NaturalFilterResult {
	dto := map[string]any{"q": domain.First100Runes(normalized), "sort": "soonest"}
	return NaturalFilterResult{
		Mode: "BASIC_SEARCH_FALLBACK", FilterDTO: dto, Chips: chipsFromDTO(dto), CanonicalQuery: canonicalQuery(dto),
		Notice: "Filter AI tidak tersedia; pencarian kata kunci digunakan.",
	}
}

func mustJakarta() *time.Location {
	loc, err := time.LoadLocation(domain.CatalogFilterTZ)
	if err != nil {
		return time.UTC
	}
	return loc
}

func normalizeFilterDraft(draft map[string]any, opts CatalogFilters) (map[string]any, error) {
	allowed := map[string]struct{}{"q": {}, "category": {}, "city": {}, "province": {}, "dateFrom": {}, "dateTo": {}, "sort": {}}
	for k := range draft {
		if _, ok := allowed[k]; !ok {
			return nil, domain.ErrAIOutputInvalid
		}
	}
	in := domain.CatalogQuery{}
	if v, ok := draft["q"].(string); ok {
		in.Q = v
	}
	if v, ok := draft["category"].(string); ok {
		in.Category = v
	}
	if v, ok := draft["city"].(string); ok {
		in.City = v
	}
	if v, ok := draft["province"].(string); ok {
		in.Province = v
	}
	if v, ok := draft["dateFrom"].(string); ok {
		in.DateFrom = v
	}
	if v, ok := draft["dateTo"].(string); ok {
		in.DateTo = v
	}
	if v, ok := draft["sort"].(string); ok {
		in.Sort = domain.CatalogSort(v)
	}
	q, err := domain.NormalizeCatalogQuery(in)
	if err != nil {
		return nil, err
	}
	if q.Category != "" && !containsFold(opts.Categories, q.Category) {
		return nil, domain.ErrAIOutputInvalid
	}
	if q.City != "" || q.Province != "" {
		okLoc := false
		for _, loc := range opts.Locations {
			if (q.City == "" || strings.EqualFold(loc.City, q.City)) && (q.Province == "" || strings.EqualFold(loc.Province, q.Province)) {
				okLoc = true
				break
			}
		}
		if !okLoc {
			return nil, domain.ErrAIOutputInvalid
		}
	}
	return dtoFromQuery(q), nil
}

func dtoFromQuery(q domain.CatalogQuery) map[string]any {
	out := map[string]any{}
	if q.Q != "" {
		out["q"] = q.Q
	}
	if q.Category != "" {
		out["category"] = q.Category
	}
	if q.City != "" {
		out["city"] = q.City
	}
	if q.Province != "" {
		out["province"] = q.Province
	}
	if q.Tag != "" {
		out["tag"] = q.Tag
	}
	if q.DateFrom != "" {
		out["dateFrom"] = q.DateFrom
		out["dateTo"] = q.DateTo
	}
	out["sort"] = string(q.Sort)
	return out
}

func chipsFromDTO(dto map[string]any) []FilterChip {
	order := []string{"q", "category", "city", "province", "tag", "dateFrom", "dateTo", "sort"}
	labels := map[string]string{"q": "Kata kunci", "category": "Kategori", "city": "Kota", "province": "Provinsi", "tag": "Tag", "dateFrom": "Dari", "dateTo": "Sampai", "sort": "Urutan"}
	var chips []FilterChip
	for _, k := range order {
		v, ok := dto[k]
		if !ok {
			continue
		}
		s, _ := v.(string)
		if s == "" || (k == "sort" && s == "soonest") {
			continue
		}
		chips = append(chips, FilterChip{Key: k, Label: labels[k], Value: s})
	}
	return chips
}

func canonicalQuery(dto map[string]any) string {
	keys := []string{"q", "category", "city", "province", "tag", "dateFrom", "dateTo", "sort"}
	var parts []string
	for _, k := range keys {
		v, ok := dto[k].(string)
		if !ok || v == "" {
			continue
		}
		if k == "sort" && v == "soonest" {
			continue
		}
		parts = append(parts, k+"="+urlQueryEscape(v))
	}
	return strings.Join(parts, "&")
}

func urlQueryEscape(s string) string {
	return url.QueryEscape(s)
}

func containsFold(items []string, want string) bool {
	for _, it := range items {
		if strings.EqualFold(it, want) {
			return true
		}
	}
	return false
}

func (s *Service) emitCatalog(ctx context.Context, name string, resultCount int) {
	if s.Analytics == nil {
		return
	}
	_ = resultCount
	_ = s.Analytics.Emit(ctx, analyticsapp.Input{
		Name:       name,
		Properties: map[string]any{"source": "api"},
	})
}

func AppliedFilters(q domain.CatalogQuery) map[string]any {
	b, _ := json.Marshal(dtoFromQuery(q))
	var out map[string]any
	_ = json.Unmarshal(b, &out)
	if out == nil {
		out = map[string]any{}
	}
	return out
}
