package domain

import (
	"errors"
	"strings"
	"time"
)

type Type string
type Channel string
type OutboxStatus string
type DeliveryStatus string

const (
	TypeOrganizerApproved     Type = "ORGANIZER_APPROVED"
	TypeOrganizerRejected     Type = "ORGANIZER_REJECTED"
	TypeOrganizerSuspended    Type = "ORGANIZER_SUSPENDED"
	TypeEventPublished        Type = "EVENT_PUBLISHED"
	TypeEventRejected         Type = "EVENT_REJECTED"
	TypeEventCancelled        Type = "EVENT_CANCELLED"
	TypePaymentSucceeded      Type = "PAYMENT_SUCCEEDED"
	TypePaymentFailed         Type = "PAYMENT_FAILED"
	TypeTicketIssued          Type = "TICKET_ISSUED"
	TypeRefundUpdated         Type = "REFUND_UPDATED"
	TypeEventReminder         Type = "EVENT_REMINDER"
	TypePasswordResetAssisted Type = "PASSWORD_RESET_ASSISTED"

	ChannelInApp Channel = "IN_APP"
	ChannelEmail Channel = "EMAIL"

	OutboxPending    OutboxStatus = "PENDING"
	OutboxProcessing OutboxStatus = "PROCESSING"
	OutboxCompleted  OutboxStatus = "COMPLETED"
	OutboxFailed     OutboxStatus = "FAILED"

	DeliveryPending    DeliveryStatus = "PENDING"
	DeliveryProcessing DeliveryStatus = "PROCESSING"
	DeliverySent       DeliveryStatus = "SENT"
	DeliveryFailed     DeliveryStatus = "FAILED"
	DeliverySkipped    DeliveryStatus = "SKIPPED"

	MaxAttempts = 5
	ResetTTL    = 30 * time.Minute
)

var (
	ErrNotFound            = errors.New("NOTIFICATION_NOT_FOUND")
	ErrCursorInvalid       = errors.New("NOTIFICATION_CURSOR_INVALID")
	ErrDeliveryFailed      = errors.New("NOTIFICATION_DELIVERY_FAILED")
	ErrEmailNotConfigured  = errors.New("EMAIL_NOT_CONFIGURED")
	ErrEmailUnavailable    = errors.New("EMAIL_PROVIDER_UNAVAILABLE")
	ErrResetRateLimited    = errors.New("PASSWORD_RESET_RATE_LIMITED")
	ErrResetTokenInvalid   = errors.New("PASSWORD_RESET_TOKEN_INVALID")
	ErrResetNotEligible    = errors.New("PASSWORD_RESET_NOT_ELIGIBLE")
	ErrResetAssistRequired = errors.New("PASSWORD_RESET_ASSISTANCE_REQUIRED")
	ErrReminderIneligible  = errors.New("REMINDER_NOT_ELIGIBLE")
	ErrJobUnauthorized     = errors.New("REMINDER_JOB_UNAUTHORIZED")
	ErrJobFailed           = errors.New("REMINDER_JOB_FAILED")
	ErrAccessDenied        = errors.New("NOTIFICATION_ACCESS_DENIED")
	ErrPayloadInvalid      = errors.New("NOTIFICATION_PAYLOAD_INVALID")
)

type Notification struct {
	ID            string
	RecipientID   string
	Type          Type
	Title         string
	Body          string
	ActionPath    *string
	EntityType    *string
	EntityID      *string
	DedupKey      string
	CreatedAt     time.Time
	ReadAt        *time.Time
	ExpiresAt     *time.Time
}

type OutboxRow struct {
	ID            string
	DomainEventID string
	RecipientID   string
	Type          Type
	Payload       map[string]any
	Status        OutboxStatus
	AttemptCount  int
	NextAttemptAt time.Time
}

type Command struct {
	DomainEventID string
	RecipientID   string
	Type          Type
	EntityType    string
	EntityID      string
	ActionPath    string
	TitleOverride string
	BodyOverride  string
	Payload       map[string]any
}

type ReminderCandidate struct {
	EventID     string
	RecipientID string
	Title       string
	Venue       string
	StartsAt    time.Time
	Timezone    string
}

type EmailMessage struct {
	TemplateKey string
	Idempotency string
	Subject     string
	TextBody    string
}

func SafeActionPath(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(raw, "/") && !strings.HasPrefix(raw, "//") && !strings.Contains(raw, "://") {
		return raw
	}
	return ""
}

func DedupKey(domainEventID, recipientID string, t Type, ch Channel) string {
	return strings.TrimSpace(domainEventID) + "|" + recipientID + "|" + string(t) + "|" + string(ch)
}

func ReminderDomainEvent(eventID, recipientID string) string {
	return "event-reminder:" + eventID + ":" + recipientID
}

func Backoff(attempt int, now time.Time) time.Time {
	mins := 1 << attempt
	if mins > 360 {
		mins = 360
	}
	return now.Add(time.Duration(mins) * time.Minute)
}
