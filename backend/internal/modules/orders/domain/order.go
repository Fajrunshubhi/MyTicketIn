package domain

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

type Status string

const (
	StatusPending   Status = "PENDING"
	StatusPaid      Status = "PAID"
	StatusFailed    Status = "FAILED"
	StatusExpired   Status = "EXPIRED"
	StatusCancelled Status = "CANCELLED"
	StatusRefunded  Status = "REFUNDED"

	HoldDuration     = 15 * time.Minute
	IdempotencyTTL   = 24 * time.Hour
	MaxUnitsPerType  = 10000
	MaxTicketTypes   = 10
	MaxOrderSubtotal = int64(9_000_000_000_000)
	ScopeCreateOrder = "CREATE_ORDER"
	IdempotencyProc  = "PROCESSING"
	IdempotencyDone  = "COMPLETED"
	ReleaseExpired   = "EXPIRED"
	ReleaseCancelled = "CANCELLED"
	ReleaseConverted = "CONVERTED_TO_PAID"
)

var (
	ErrCheckoutInvalid = errors.New("CHECKOUT_INVALID")
	ErrNotPurchasable  = errors.New("EVENT_NOT_PURCHASABLE")
	ErrSaleNotActive   = errors.New("SALE_NOT_ACTIVE")
	ErrPurchaseLimit   = errors.New("PURCHASE_LIMIT_EXCEEDED")
	ErrAttendeeDuplicate = errors.New("ATTENDEE_DUPLICATE")
	ErrInventory       = errors.New("INVENTORY_UNAVAILABLE")
	ErrPriceChanged    = errors.New("PRICE_CHANGED")
	ErrNotFound        = errors.New("ORDER_NOT_FOUND")
	ErrExpired         = errors.New("ORDER_EXPIRED")
	ErrKeyRequired     = errors.New("IDEMPOTENCY_KEY_REQUIRED")
	ErrKeyReused       = errors.New("IDEMPOTENCY_KEY_REUSED")
	ErrKeyInProgress   = errors.New("IDEMPOTENCY_IN_PROGRESS")
	ErrJobUnauthorized = errors.New("EXPIRY_JOB_UNAUTHORIZED")
	ErrConflict        = errors.New("ORDER_CONFLICT")
	ErrModeMismatch    = errors.New("INVENTORY_MODE_MISMATCH")
	ErrSeatUnavailable = errors.New("SEAT_UNAVAILABLE")
	ErrRateLimited     = errors.New("RATE_LIMITED")
)

type AttendeeInput struct {
	FullName       string `json:"fullName"`
	Email          string `json:"email"`
	Phone          string `json:"phone"`
	IdentityNumber string `json:"identityNumber"`
}

type LineInput struct {
	TicketTypeID string          `json:"ticketTypeId"`
	Quantity     int             `json:"quantity"`
	Attendees    []AttendeeInput `json:"attendees"`
}

type CheckoutInput struct {
	EventID      string          `json:"eventId"`
	Items        []LineInput     `json:"items"`
	SeatIDs      []string        `json:"seatIds"`
	Attendees    []AttendeeInput `json:"attendees"`
	RedeemPoints int64           `json:"redeemPoints"`
	Confirmed    bool            `json:"confirmed"`
}

type Item struct {
	ID              string
	OrderID         string
	TicketTypeID    string
	TicketTypeName  string
	SectionName     *string
	SeatLabel       *string
	EventSeatID     *string
	UnitPriceRupiah int64
	Quantity        int
	LineTotalRupiah int64
	Attendees       []AttendeeInput
}

type Order struct {
	ID                    string
	OrderNumber           string
	BuyerUserID           string
	EventID               string
	Status                Status
	Currency              string
	SubtotalRupiah        int64
	LoyaltyDiscountRupiah int64
	TotalPayableRupiah    int64
	LoyaltyAccountID      *string
	RedeemedPoints        int64
	LoyaltyEarnedPoints   int64
	LoyaltyReversedPoints int64
	LoyaltyRedeemedRestored bool
	ExpiresAt             time.Time
	ExpiredAt             *time.Time
	CancelledAt           *time.Time
	CancellationReason    *string
	CreatedAt             time.Time
	UpdatedAt             time.Time
	Version               int
	Items                 []Item
}

type Reservation struct {
	ID            string
	OrderID       string
	OrderItemID   string
	TicketTypeID  string
	EventSeatID   *string
	Quantity      int
	ExpiresAt     time.Time
	ReleasedAt    *time.Time
	ReleaseReason *string
}

type Idempotency struct {
	ID           string
	ActorUserID  string
	Scope        string
	KeyHash      string
	RequestHash  string
	Status       string
	ResourceType *string
	ResourceID   *string
	HTTPStatus   *int
	ResponseBody []byte
	ExpiresAt    time.Time
}

func NormalizeCheckout(in CheckoutInput) (CheckoutInput, error) {
	in.EventID = strings.TrimSpace(in.EventID)
	if in.EventID == "" {
		return CheckoutInput{}, ErrCheckoutInvalid
	}
	if in.RedeemPoints < 0 {
		return CheckoutInput{}, ErrCheckoutInvalid
	}
	seen := map[string]struct{}{}
	var items []LineInput
	for _, it := range in.Items {
		it.TicketTypeID = strings.TrimSpace(it.TicketTypeID)
		if it.TicketTypeID == "" {
			continue
		}
		if _, ok := seen[it.TicketTypeID]; ok {
			return CheckoutInput{}, ErrCheckoutInvalid
		}
		seen[it.TicketTypeID] = struct{}{}
		if it.Quantity < 1 || it.Quantity > MaxUnitsPerType {
			return CheckoutInput{}, ErrCheckoutInvalid
		}
		atts, err := normalizeAttendeeList(it.Attendees, it.Quantity, false)
		if err != nil {
			return CheckoutInput{}, err
		}
		it.Attendees = atts
		items = append(items, it)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].TicketTypeID < items[j].TicketTypeID })
	if len(items) > MaxTicketTypes {
		return CheckoutInput{}, ErrCheckoutInvalid
	}
	seats := uniqueSorted(in.SeatIDs)
	if len(items) == 0 && len(seats) == 0 {
		return CheckoutInput{}, ErrCheckoutInvalid
	}
	in.Items = items
	in.SeatIDs = seats
	seatAtt, err := normalizeAttendeeList(in.Attendees, len(seats), false)
	if err != nil {
		return CheckoutInput{}, err
	}
	in.Attendees = seatAtt
	return in, nil
}

func normalizeAttendeeList(raw []AttendeeInput, expected int, required bool) ([]AttendeeInput, error) {
	if len(raw) == 0 {
		if required {
			return nil, ErrCheckoutInvalid
		}
		return nil, nil
	}
	if expected > 0 && len(raw) != expected {
		return nil, ErrCheckoutInvalid
	}
	seen := map[string]struct{}{}
	out := make([]AttendeeInput, 0, len(raw))
	for _, a := range raw {
		n, err := NormalizeAttendee(a)
		if err != nil {
			return nil, err
		}
		if _, ok := seen[n.IdentityNumber]; ok {
			return nil, ErrAttendeeDuplicate
		}
		seen[n.IdentityNumber] = struct{}{}
		out = append(out, n)
	}
	return out, nil
}

func NormalizeAttendee(in AttendeeInput) (AttendeeInput, error) {
	in.FullName = strings.TrimSpace(in.FullName)
	if n := utf8.RuneCountInString(in.FullName); n < 2 || n > 120 {
		return AttendeeInput{}, ErrCheckoutInvalid
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if in.Email == "" || !strings.Contains(in.Email, "@") || utf8.RuneCountInString(in.Email) > 254 {
		return AttendeeInput{}, ErrCheckoutInvalid
	}
	phone := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, in.Phone)
	if len(phone) < 10 || len(phone) > 15 {
		return AttendeeInput{}, ErrCheckoutInvalid
	}
	in.Phone = phone
	in.IdentityNumber = strings.TrimSpace(in.IdentityNumber)
	if len(in.IdentityNumber) != 16 {
		return AttendeeInput{}, ErrCheckoutInvalid
	}
	for _, r := range in.IdentityNumber {
		if r < '0' || r > '9' {
			return AttendeeInput{}, ErrCheckoutInvalid
		}
	}
	return in, nil
}

func RequireHolders(in CheckoutInput) error {
	seen := map[string]struct{}{}
	add := func(list []AttendeeInput, n int) error {
		if len(list) != n || n == 0 {
			return ErrCheckoutInvalid
		}
		for _, a := range list {
			if _, ok := seen[a.IdentityNumber]; ok {
				return ErrAttendeeDuplicate
			}
			seen[a.IdentityNumber] = struct{}{}
		}
		return nil
	}
	if len(in.SeatIDs) > 0 {
		return add(in.Attendees, len(in.SeatIDs))
	}
	for _, it := range in.Items {
		if err := add(it.Attendees, it.Quantity); err != nil {
			return err
		}
	}
	if len(seen) == 0 {
		return ErrCheckoutInvalid
	}
	return nil
}

func AllAttendees(in CheckoutInput) []AttendeeInput {
	if len(in.SeatIDs) > 0 {
		return in.Attendees
	}
	var out []AttendeeInput
	for _, it := range in.Items {
		out = append(out, it.Attendees...)
	}
	return out
}

func uniqueSorted(ids []string) []string {
	seen := map[string]struct{}{}
	var out []string
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

func CanonicalHash(in CheckoutInput) (string, error) {
	norm, err := NormalizeCheckout(in)
	if err != nil {
		return "", err
	}
	type line struct {
		TicketTypeID string          `json:"ticketTypeId"`
		Quantity     int             `json:"quantity"`
		Attendees    []AttendeeInput `json:"attendees"`
	}
	payload := struct {
		EventID      string          `json:"eventId"`
		Items        []line          `json:"items"`
		SeatIDs      []string        `json:"seatIds"`
		Attendees    []AttendeeInput `json:"attendees"`
		RedeemPoints int64           `json:"redeemPoints"`
	}{EventID: norm.EventID, SeatIDs: norm.SeatIDs, Attendees: norm.Attendees, RedeemPoints: norm.RedeemPoints}
	for _, it := range norm.Items {
		payload.Items = append(payload.Items, line{TicketTypeID: it.TicketTypeID, Quantity: it.Quantity, Attendees: it.Attendees})
	}
	if payload.Items == nil {
		payload.Items = []line{}
	}
	if payload.SeatIDs == nil {
		payload.SeatIDs = []string{}
	}
	if payload.Attendees == nil {
		payload.Attendees = []AttendeeInput{}
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:]), nil
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

func Remaining(quota, reserved, paid int) int {
	v := quota - reserved - paid
	if v < 0 {
		return 0
	}
	return v
}

func StockLabel(remaining, quota int) string {
	if remaining <= 0 {
		return "SOLD_OUT"
	}
	if remaining <= 5 || (quota > 0 && remaining*10 <= quota) {
		return "LOW"
	}
	return "AVAILABLE"
}
