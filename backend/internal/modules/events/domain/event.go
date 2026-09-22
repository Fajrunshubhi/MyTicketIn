package domain

import (
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

type Status string
type InventoryMode string
type ImageStatus string

const (
	StatusDraft         Status = "DRAFT"
	StatusPendingReview Status = "PENDING_REVIEW"
	StatusPublished     Status = "PUBLISHED"
	StatusRejected      Status = "REJECTED"
	StatusCancelled     Status = "CANCELLED"
	StatusCompleted     Status = "COMPLETED"

	ModeGA       InventoryMode = "GENERAL_ADMISSION"
	ModeZoned    InventoryMode = "ZONED"
	ModeReserved InventoryMode = "RESERVED_SEATING"

	ImagePending ImageStatus = "PENDING_UPLOAD"
	ImageReady   ImageStatus = "READY"
	ImageFailed  ImageStatus = "FAILED"
	ImageDeleted ImageStatus = "DELETED"
)

var Timezones = []string{"Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"}

var (
	ErrNotFound             = errors.New("EVENT_NOT_FOUND")
	ErrAccessDenied         = errors.New("EVENT_ACCESS_DENIED")
	ErrStatusInvalid        = errors.New("EVENT_STATUS_INVALID")
	ErrVersionConflict      = errors.New("EVENT_VERSION_CONFLICT")
	ErrIncomplete           = errors.New("EVENT_INCOMPLETE")
	ErrTimeInvalid          = errors.New("EVENT_TIME_INVALID")
	ErrSlugConflict         = errors.New("EVENT_SLUG_CONFLICT")
	ErrTicketInvalid        = errors.New("TICKET_TYPE_INVALID")
	ErrQuotaBelowSold       = errors.New("TICKET_QUOTA_BELOW_SOLD")
	ErrTicketNameExists     = errors.New("TICKET_TYPE_NAME_EXISTS")
	ErrTicketRequired       = errors.New("TICKET_TYPE_REQUIRED")
	ErrStorageNotConfigured = errors.New("STORAGE_NOT_CONFIGURED")
	ErrImageTypeInvalid     = errors.New("IMAGE_TYPE_INVALID")
	ErrImageTooLarge        = errors.New("IMAGE_TOO_LARGE")
	ErrImageMetaMismatch    = errors.New("IMAGE_METADATA_MISMATCH")
	ErrRateLimited          = errors.New("RATE_LIMITED")
	ErrModeMismatch         = errors.New("INVENTORY_MODE_MISMATCH")
	ErrAINotConfigured      = errors.New("AI_NOT_CONFIGURED")
	ErrAIRateLimited        = errors.New("AI_RATE_LIMITED")
	ErrAIInProgress         = errors.New("AI_REQUEST_IN_PROGRESS")
	ErrAIInputUnsupported   = errors.New("AI_INPUT_UNSUPPORTED")
	ErrAIOutputInvalid      = errors.New("AI_OUTPUT_INVALID")
	ErrAIUnavailable        = errors.New("AI_PROVIDER_UNAVAILABLE")
	ErrAITimeout            = errors.New("AI_TIMEOUT")
	ErrAIBudget             = errors.New("AI_BUDGET_EXCEEDED")
	ErrTagsInvalid          = errors.New("EVENT_TAGS_INVALID")
	ErrCoordinatesInvalid   = errors.New("EVENT_COORDINATES_INVALID")
)

const MaxEventTags = 8
const MaxGalleryURLs = 8

var tagRE = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

type Event struct {
	ID                 string
	OrganizerProfileID string
	Slug               string
	Title              string
	Description        string
	Category           string
	VenueName          string
	AddressLine        string
	City               string
	Province           string
	Latitude           *float64
	Longitude          *float64
	Tags               []string
	GalleryURLs        []string
	Timezone           string
	StartsAt           time.Time
	EndsAt             time.Time
	Terms              string
	ContactEmail       string
	ContactPhone       *string
	Status             Status
	InventoryMode      InventoryMode
	SubmittedAt        *time.Time
	ModerationReason   *string
	DecidedAt          *time.Time
	DecidedByUserID    *string
	PublishedAt        *time.Time
	CancelledAt        *time.Time
	CancelledByUserID  *string
	CancellationReason *string
	CompletedAt        *time.Time
	CreatedAt          time.Time
	UpdatedAt          time.Time
	Version            int
}

type TicketType struct {
	ID                   string
	EventID              string
	Name                 string
	Description          *string
	PriceRupiah          int64
	Quota                int
	MaxPerAccount        int
	SaleStartsAt         time.Time
	SaleEndsAt           time.Time
	SortOrder            int
	SalesStoppedAt       *time.Time
	SalesStoppedByUserID *string
	SalesStopReason      *string
	ReservedQuantity     int
	PaidQuantity         int
	CreatedAt            time.Time
	UpdatedAt            time.Time
	Version              int
}

type Section struct {
	ID           string `json:"id"`
	EventID      string `json:"eventId"`
	TicketTypeID string `json:"ticketTypeId"`
	Name         string `json:"name"`
	SortOrder    int    `json:"sortOrder"`
}

type Seat struct {
	ID        string `json:"id"`
	EventID   string `json:"eventId"`
	SectionID string `json:"sectionId"`
	Label     string `json:"label"`
}

type SeatMap struct {
	ID         string      `json:"id"`
	EventID    string      `json:"eventId"`
	StorageKey string      `json:"storageKey"`
	MimeType   string      `json:"mimeType"`
	ByteSize   int         `json:"byteSize"`
	AltText    string      `json:"altText"`
	Legend     string      `json:"legend"`
	Status     ImageStatus `json:"status"`
}

type ImageAsset struct {
	ID           string
	EventID      string
	StorageKey   string
	OriginalName string
	MimeType     string
	ByteSize     int
	Width        *int
	Height       *int
	AltText      string
	Status       ImageStatus
	IsPrimary    bool
	DeletedAt    *time.Time
}

func AllowedTimezone(tz string) bool {
	for _, a := range Timezones {
		if a == tz {
			return true
		}
	}
	return false
}

func NormalizeTags(raw []string) ([]string, error) {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		tag := strings.ToLower(strings.TrimSpace(item))
		tag = strings.Join(strings.Fields(strings.ReplaceAll(tag, "_", "-")), "-")
		if tag == "" {
			continue
		}
		n := utf8.RuneCountInString(tag)
		if n < 2 || n > 32 || !tagRE.MatchString(tag) {
			return nil, ErrTagsInvalid
		}
		if _, ok := seen[tag]; ok {
			continue
		}
		seen[tag] = struct{}{}
		out = append(out, tag)
		if len(out) > MaxEventTags {
			return nil, ErrTagsInvalid
		}
	}
	if out == nil {
		out = []string{}
	}
	return out, nil
}

func ValidCoordinates(lat, lng float64) bool {
	return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

func ParseMode(raw string) (InventoryMode, error) {
	switch InventoryMode(raw) {
	case ModeGA, ModeZoned, ModeReserved:
		return InventoryMode(raw), nil
	default:
		return "", ErrModeMismatch
	}
}

func Mutatable(status Status) bool {
	return status == StatusDraft
}

func Suggestable(status Status) bool {
	return status == StatusDraft || status == StatusRejected
}
