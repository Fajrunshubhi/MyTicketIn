package domain

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode"
)

type Result string
type InputType string

const (
	ResultValid       Result = "VALID"
	ResultAlreadyUsed Result = "ALREADY_USED"
	ResultInvalid     Result = "INVALID"
	ResultCancelled   Result = "CANCELLED"
	ResultWrongEvent  Result = "WRONG_EVENT"

	InputQR     InputType = "QR_TOKEN"
	InputManual InputType = "MANUAL_CODE"

	ReasonOK           = "CHECKIN_OK"
	ReasonAlreadyUsed  = "TICKET_ALREADY_USED"
	ReasonUnknown      = "TOKEN_UNKNOWN"
	ReasonFormat       = "TOKEN_FORMAT_INVALID"
	ReasonCancelled    = "TICKET_CANCELLED"
	ReasonWrongEvent   = "WRONG_EVENT"
	ReasonOrderNotPaid = "ORDER_NOT_PAID"
	ReasonEventCancel  = "EVENT_CANCELLED"
)

var (
	ErrAccessDenied   = errors.New("SCANNER_ACCESS_DENIED")
	ErrNotFound       = errors.New("EVENT_NOT_FOUND")
	ErrRequestInvalid = errors.New("CHECKIN_REQUEST_INVALID")
	ErrKeyRequired    = errors.New("IDEMPOTENCY_KEY_REQUIRED")
	ErrKeyReused      = errors.New("IDEMPOTENCY_KEY_REUSED")
	ErrRateLimited    = errors.New("CHECKIN_RATE_LIMITED")
	ErrUnavailable    = errors.New("CHECKIN_UNAVAILABLE")
)

var qrPattern = regexp.MustCompile(`^ti1_[A-Za-z0-9_-]{43}$`)

type Attempt struct {
	ID               string
	EventID          string
	TicketID         *string
	OperatorUserID   string
	InputType        InputType
	Result           Result
	ReasonCode       string
	AttemptedAt      time.Time
	FirstUsedAt      *time.Time
	InputFingerprint string
	IdempotencyHash  string
	RequestHash      string
	CorrelationID    string
	DurationMS       int
	ClientContext    map[string]any
	TicketNumber     string
	TicketTypeName   string
	SectionName      *string
	SeatLabel        *string
	OperatorName     string
}

type TicketView struct {
	ID             string
	EventID        string
	Status         string
	OrderStatus    string
	TicketNumber   string
	TicketTypeName string
	SectionName    *string
	SeatLabel      *string
	UsedAt         *time.Time
	UsedByUserID   *string
}

type Input struct {
	Type    InputType
	Raw     string
	Context map[string]any
}

func Normalize(in Input) (normalized string, formatOK bool) {
	raw := strings.TrimSpace(in.Raw)
	switch in.Type {
	case InputQR:
		return raw, qrPattern.MatchString(raw)
	case InputManual:
		var b strings.Builder
		for _, r := range strings.ToUpper(raw) {
			if r == '-' || r == ' ' {
				continue
			}
			b.WriteRune(r)
		}
		out := b.String()
		if len(out) != 16 {
			return out, false
		}
		for _, r := range out {
			if (r < 'A' || r > 'Z') && (r < '0' || r > '9') {
				return out, false
			}
		}
		return out, true
	default:
		return raw, false
	}
}

func RequestHash(inputType InputType, normalized string) string {
	sum := sha256.Sum256([]byte(string(inputType) + "|" + normalized))
	return hex.EncodeToString(sum[:])
}

func KeyHash(key string) string {
	sum := sha256.Sum256([]byte(key))
	return hex.EncodeToString(sum[:])
}

func Fingerprint(secret, normalized string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(normalized))
	return hex.EncodeToString(mac.Sum(nil))
}

func SanitizeContext(in map[string]any) map[string]any {
	out := map[string]any{}
	if in == nil {
		return out
	}
	for _, k := range []string{"scannerVersion", "cameraFacing", "browserFamily"} {
		if v, ok := in[k]; ok {
			if s, ok := v.(string); ok {
				s = strings.TrimSpace(s)
				if s != "" && len(s) <= 40 {
					out[k] = s
				}
			}
		}
	}
	return out
}

func ValidateIdempotencyKey(raw string) error {
	if len(raw) < 16 || len(raw) > 128 {
		return ErrKeyRequired
	}
	for _, r := range raw {
		if r > unicode.MaxASCII || r < 33 || r > 126 {
			return ErrKeyRequired
		}
	}
	return nil
}

func MaskNumber(n string) string {
	n = strings.TrimSpace(n)
	if len(n) <= 7 {
		return n
	}
	return n[:7] + strings.Repeat("*", len(n)-7)
}

func Message(result Result) string {
	switch result {
	case ResultValid:
		return "Tiket valid. Tamu dapat masuk."
	case ResultAlreadyUsed:
		return "Tiket sudah digunakan."
	case ResultCancelled:
		return "Tiket dibatalkan."
	case ResultWrongEvent:
		return "Tiket untuk event lain."
	default:
		return "Tiket tidak valid."
	}
}

func Classify(ticket *TicketView, eventID, eventStatus string) (Result, string) {
	if ticket == nil {
		return ResultInvalid, ReasonUnknown
	}
	if ticket.EventID != eventID {
		return ResultWrongEvent, ReasonWrongEvent
	}
	if ticket.Status == "CANCELLED" {
		return ResultCancelled, ReasonCancelled
	}
	if ticket.Status == "USED" {
		return ResultAlreadyUsed, ReasonAlreadyUsed
	}
	if eventStatus == "CANCELLED" {
		return ResultInvalid, ReasonEventCancel
	}
	if ticket.OrderStatus != "PAID" {
		return ResultInvalid, ReasonOrderNotPaid
	}
	if ticket.Status != "UNUSED" {
		return ResultInvalid, ReasonUnknown
	}
	return ResultValid, ReasonOK
}
