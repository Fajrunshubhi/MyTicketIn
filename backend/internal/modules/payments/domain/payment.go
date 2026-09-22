package domain

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type Status string
type Method string
type WebhookStatus string
type ReconStatus string
type RefundStatus string

const (
	ProviderSandbox = "sandbox"

	StatusCreated   Status = "CREATED"
	StatusPending   Status = "PENDING"
	StatusSucceeded Status = "SUCCEEDED"
	StatusFailed    Status = "FAILED"
	StatusExpired   Status = "EXPIRED"
	StatusRefunded  Status = "REFUNDED"

	MethodQRIS   Method = "QRIS"
	MethodVA     Method = "VIRTUAL_ACCOUNT"
	MethodWallet Method = "EWALLET"

	WebhookReceived  WebhookStatus = "RECEIVED"
	WebhookProcessed WebhookStatus = "PROCESSED"
	WebhookRejected  WebhookStatus = "REJECTED"
	WebhookFailed    WebhookStatus = "FAILED"

	ReconOpen     ReconStatus = "OPEN"
	ReconAccepted ReconStatus = "RESOLVED_ACCEPTED"
	ReconRejected ReconStatus = "RESOLVED_REJECTED"

	RefundRequested  RefundStatus = "REQUESTED"
	RefundApproved   RefundStatus = "APPROVED"
	RefundRejected   RefundStatus = "REJECTED"
	RefundProcessing RefundStatus = "PROCESSING"
	RefundCompleted  RefundStatus = "COMPLETED"
	RefundFailed     RefundStatus = "FAILED"

	EventPaymentSucceeded = "payment.succeeded"
	EventPaymentFailed    = "payment.failed"
	EventPaymentExpired   = "payment.expired"
	EventRefundCompleted  = "refund.completed"
)

var (
	ErrNotAllowed          = errors.New("PAYMENT_NOT_ALLOWED")
	ErrMethodUnavailable   = errors.New("PAYMENT_METHOD_UNAVAILABLE")
	ErrProviderUnavailable = errors.New("PAYMENT_PROVIDER_UNAVAILABLE")
	ErrAmountMismatch      = errors.New("PAYMENT_AMOUNT_MISMATCH")
	ErrSignatureInvalid    = errors.New("WEBHOOK_SIGNATURE_INVALID")
	ErrMalformed           = errors.New("WEBHOOK_MALFORMED")
	ErrEventCollision      = errors.New("WEBHOOK_EVENT_COLLISION")
	ErrTransitionInvalid   = errors.New("PAYMENT_TRANSITION_INVALID")
	ErrLateSuccess         = errors.New("PAYMENT_LATE_SUCCESS")
	ErrRefundNotAllowed    = errors.New("REFUND_NOT_ALLOWED")
	ErrRefundAmount        = errors.New("REFUND_AMOUNT_INVALID")
	ErrRefundProvider      = errors.New("REFUND_PROVIDER_FAILED")
	ErrNotFound            = errors.New("PAYMENT_NOT_FOUND")
	ErrKeyRequired         = errors.New("IDEMPOTENCY_KEY_REQUIRED")
	ErrKeyReused           = errors.New("IDEMPOTENCY_KEY_REUSED")
	ErrKeyInProgress       = errors.New("IDEMPOTENCY_IN_PROGRESS")
	ErrRateLimited         = errors.New("RATE_LIMITED")
	ErrFulfillmentBlocked  = errors.New("REFUND_FULFILLMENT_BLOCKED")
)

type Payment struct {
	ID                     string
	OrderID                string
	Provider               string
	Environment            string
	ExternalReference      *string
	ProviderIdempotencyKey string
	Method                 Method
	AmountRupiah           int64
	Currency               string
	Status                 Status
	InstructionData        map[string]any
	FailureCode            *string
	ProviderExpiresAt      *time.Time
	SucceededAt            *time.Time
	FailedAt               *time.Time
	RefundedAt             *time.Time
	CreatedAt              time.Time
	UpdatedAt              time.Time
	Version                int
}

type WebhookEvent struct {
	ID                string
	Provider          string
	ExternalEventID   string
	ExternalReference *string
	PayloadHash       string
	SignatureValid    bool
	ProcessingStatus  WebhookStatus
	MappedStatus      *Status
	ReasonCode        *string
	ReceivedAt        time.Time
	ProcessedAt       *time.Time
	CorrelationID     string
	SanitizedPayload  map[string]any
}

type Reconciliation struct {
	ID             string
	PaymentID      string
	OrderID        string
	WebhookEventID string
	ReasonCode     string
	Status         ReconStatus
	ProviderAmount *int64
	Notes          *string
	ResolvedBy     *string
	ResolvedAt     *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
	Version        int
	OrderNumber    string
}

type Refund struct {
	ID                 string
	RefundNumber       string
	OrderID            string
	PaymentID          string
	AmountRupiah       int64
	Reason             string
	Status             RefundStatus
	RequestedByUserID  string
	DecidedByUserID    *string
	DecisionReason     *string
	ExternalReference  *string
	ProviderEventID    *string
	LoyaltyProcessedAt *time.Time
	RequestedAt        time.Time
	DecidedAt          *time.Time
	CompletedAt        *time.Time
	CreatedAt          time.Time
	UpdatedAt          time.Time
	Version            int
}

type CreateResult struct {
	ExternalReference string
	Status            Status
	Instructions      map[string]any
	ProviderExpiresAt *time.Time
}

type VerifiedWebhook struct {
	Valid             bool
	EventID           string
	ExternalReference string
	EventType         string
	AmountRupiah      int64
	PayloadHash       string
	SafePayload       map[string]any
}

type Gateway interface {
	CreatePayment(merchantRef string, amount int64, method Method, expiresAt time.Time, idempotencyKey string) (CreateResult, error)
	VerifyWebhook(rawBody []byte, headers map[string]string, receivedAt time.Time) (VerifiedWebhook, error)
	RefundSandbox(externalPaymentRef, refundRef string, amount int64, reason string) (string, Status, string, error)
	GetPaymentStatusSandbox(externalRef string) (Status, error)
}

type FulfillmentGuard interface {
	CanRefund(orderID string) error
}

type AllowAllGuard struct{}

func (AllowAllGuard) CanRefund(string) error { return nil }

func ParseMethod(raw string) (Method, error) {
	switch Method(strings.ToUpper(strings.TrimSpace(raw))) {
	case MethodQRIS, MethodVA, MethodWallet:
		return Method(strings.ToUpper(strings.TrimSpace(raw))), nil
	default:
		return "", ErrMethodUnavailable
	}
}

func MapEvent(eventType string) (Status, bool, bool) {
	switch eventType {
	case EventPaymentSucceeded:
		return StatusSucceeded, false, true
	case EventPaymentFailed:
		return StatusFailed, false, true
	case EventPaymentExpired:
		return StatusExpired, false, true
	case EventRefundCompleted:
		return StatusRefunded, true, true
	default:
		return "", false, false
	}
}

func PayloadHash(raw []byte) string {
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

func SignBody(secret string, raw []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(raw)
	return hex.EncodeToString(mac.Sum(nil))
}

func SignatureOK(secret, got string, raw []byte) bool {
	want, err := hex.DecodeString(SignBody(secret, raw))
	if err != nil {
		return false
	}
	have, err := hex.DecodeString(strings.TrimSpace(got))
	if err != nil || len(have) != len(want) {
		return false
	}
	return hmac.Equal(want, have)
}

func Instructions(method Method, ref string, amount int64, exp time.Time) map[string]any {
	out := map[string]any{
		"sandbox": true, "provider": ProviderSandbox, "referenceMasked": mask(ref),
		"amountRupiah": amount, "expiresAt": exp.UTC().Format(time.RFC3339),
	}
	switch method {
	case MethodQRIS:
		out["qrisPayload"] = "sandbox-qris:" + mask(ref)
		out["copyText"] = "sandbox-qris:" + mask(ref)
	case MethodVA:
		out["virtualAccount"] = "8888" + last8(ref)
		out["bank"] = "SANDBOX"
		out["copyText"] = "8888" + last8(ref)
	default:
		out["ewalletDeeplink"] = "/orders"
		out["copyText"] = ref
	}
	return out
}

func mask(s string) string {
	if len(s) <= 8 {
		return "****"
	}
	return s[:4] + "…" + s[len(s)-4:]
}

func last8(s string) string {
	s = strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' || r >= 'a' && r <= 'f' {
			return r
		}
		return -1
	}, strings.ToLower(s))
	if len(s) > 8 {
		s = s[len(s)-8:]
	}
	for len(s) < 8 {
		s = "0" + s
	}
	return s
}

func MustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
