package domain

import (
	"errors"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

var (
	ErrRangeInvalid      = errors.New("REPORT_RANGE_INVALID")
	ErrEventForbidden    = errors.New("REPORT_EVENT_FORBIDDEN")
	ErrNotFound          = errors.New("EVENT_NOT_FOUND")
	ErrQueryFailed       = errors.New("REPORT_QUERY_FAILED")
	ErrCursorInvalid     = errors.New("REPORT_CURSOR_INVALID")
	ErrExportRateLimited = errors.New("EXPORT_RATE_LIMITED")
	ErrExportFailed      = errors.New("EXPORT_FAILED")
	ErrOrganizerRequired = errors.New("ORGANIZER_REQUIRED")
	ErrAccessDenied      = errors.New("REPORT_ACCESS_DENIED")
	ErrSearchDisabled    = errors.New("ADMIN_SEARCH_DISABLED")
	ErrSearchInvalid     = errors.New("ADMIN_SEARCH_INVALID")
	ErrTrendDisabled     = errors.New("SALES_TREND_DISABLED")
	ErrRecUnavailable    = errors.New("RECOMMENDATION_UNAVAILABLE")
	ErrRecLimitInvalid   = errors.New("RECOMMENDATION_LIMIT_INVALID")
	ErrRateLimited       = errors.New("RATE_LIMITED")
)

type Summary struct {
	PaidOrderCount        int      `json:"paidOrderCount"`
	TicketsSold           int      `json:"ticketsSold"`
	GrossSandboxRupiah    int64    `json:"grossSandboxRupiah"`
	CompletedRefundRupiah int64    `json:"completedRefundRupiah"`
	CheckInCount          int      `json:"checkInCount"`
	AttendanceRate        *float64 `json:"attendanceRate"`
}

type EventRow struct {
	ID                 string
	Title              string
	Status             string
	StartsAt           time.Time
	PaidOrderCount     int
	TicketsSold        int
	GrossSandboxRupiah int64
	CheckInCount       int
}

type SalesBar struct {
	Key                string `json:"key"`
	Label              string `json:"label"`
	TicketsSold        int    `json:"ticketsSold"`
	GrossSandboxRupiah int64  `json:"grossSandboxRupiah"`
}

type Range struct {
	From *time.Time
	To   *time.Time
}

type Participant struct {
	ID           string
	OrderNumber  string
	BuyerName    string
	BuyerEmail   string
	TicketType   string
	SectionName  *string
	SeatLabel    *string
	TicketStatus string
	IssuedAt     time.Time
	CheckedInAt  *time.Time
}

type QueueItem struct {
	EntityType  string
	EntityID    string
	ReasonCode  string
	Status      string
	OccurredAt  time.Time
	SafeSummary string
}

type Signal struct {
	Category  map[string]int
	City      map[string]int
	Province  map[string]int
	Organizer map[string]int
	Purchased map[string]struct{}
}

type Candidate struct {
	ID            string
	Slug          string
	Title         string
	Category      string
	City          string
	Province      string
	StartsAt      time.Time
	Timezone      string
	OrganizerID   string
	OrganizerName string
}

func ParseRange(from, to string, now time.Time) (Range, error) {
	r := Range{}
	if strings.TrimSpace(from) == "" && strings.TrimSpace(to) == "" {
		return r, nil
	}
	if from == "" || to == "" {
		return Range{}, ErrRangeInvalid
	}
	f, err := time.Parse(time.RFC3339, from)
	if err != nil {
		return Range{}, ErrRangeInvalid
	}
	t, err := time.Parse(time.RFC3339, to)
	if err != nil {
		return Range{}, ErrRangeInvalid
	}
	if !t.After(f) || t.Sub(f) > 366*24*time.Hour {
		return Range{}, ErrRangeInvalid
	}
	_ = now
	r.From, r.To = &f, &t
	return r, nil
}

func Attendance(checkIns, sold int) *float64 {
	if sold <= 0 {
		return nil
	}
	v := float64(checkIns) / float64(sold) * 100
	return &v
}

func CSVCell(raw string) string {
	s := strings.TrimLeftFunc(raw, unicode.IsSpace)
	if s != "" {
		switch s[0] {
		case '=', '+', '-', '@', '\t', '\r':
			raw = "'" + raw
		}
	}
	raw = strings.ReplaceAll(raw, `"`, `""`)
	return `"` + raw + `"`
}

func MaskName(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "***"
	}
	r := []rune(name)
	if len(r) == 1 {
		return string(r[0]) + "*"
	}
	return string(r[0]) + strings.Repeat("*", utf8.RuneCountInString(name)-1)
}

func MaskEmail(email string) string {
	email = strings.ToLower(strings.TrimSpace(email))
	at := strings.Index(email, "@")
	if at <= 0 {
		return "***"
	}
	local, domain := email[:at], email[at:]
	r := []rune(local)
	return string(r[0]) + "***" + domain
}

func ScoreHistory(c Candidate, sig Signal) (int, string) {
	cat := min(sig.Category[c.Category], 5)
	city := min(sig.City[c.City], 5)
	prov := min(sig.Province[c.Province], 5)
	org := min(sig.Organizer[c.OrganizerID], 5)
	score := 3*cat + 2*city + prov + org
	return score, reason(cat, city, prov, org)
}

func ScoreContextual(c, current Candidate) (int, string) {
	cat, city, prov, org := 0, 0, 0, 0
	if c.Category == current.Category {
		cat = 1
	}
	if c.City == current.City {
		city = 1
	}
	if c.Province == current.Province {
		prov = 1
	}
	if c.OrganizerID == current.OrganizerID {
		org = 1
	}
	score := 3*cat + 2*city + prov + org
	return score, reason(cat, city, prov, org)
}

func reason(cat, city, prov, org int) string {
	switch {
	case cat > 0:
		return "Kategori serupa"
	case city > 0:
		return "Lokasi serupa"
	case prov > 0:
		return "Provinsi serupa"
	case org > 0:
		return "Penyelenggara yang sama"
	default:
		return ""
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
