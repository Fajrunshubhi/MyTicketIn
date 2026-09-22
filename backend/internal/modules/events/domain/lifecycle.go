package domain

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

type StaffStatus string

const (
	StaffActive  StaffStatus = "ACTIVE"
	StaffRevoked StaffStatus = "REVOKED"
)

var (
	ErrTransitionInvalid   = errors.New("EVENT_TRANSITION_INVALID")
	ErrReasonRequired      = errors.New("EVENT_REASON_REQUIRED")
	ErrNotEnded            = errors.New("EVENT_NOT_ENDED")
	ErrAlreadyCancelled    = errors.New("EVENT_ALREADY_CANCELLED")
	ErrSalesAlreadyStopped = errors.New("TICKET_SALES_ALREADY_STOPPED")
	ErrStaffUserNotFound   = errors.New("STAFF_USER_NOT_FOUND")
	ErrStaffUserInactive   = errors.New("STAFF_USER_INACTIVE")
	ErrStaffConflict       = errors.New("STAFF_ASSIGNMENT_CONFLICT")
	ErrStaffNotFound       = errors.New("STAFF_ASSIGNMENT_NOT_FOUND")
	ErrStaffAccessDenied   = errors.New("STAFF_ACCESS_DENIED")
	ErrLifecyclePending    = errors.New("EVENT_LIFECYCLE_REQUEST_PENDING")
	ErrLifecycleNotFound   = errors.New("EVENT_LIFECYCLE_REQUEST_NOT_FOUND")
	ErrLifecycleDecided    = errors.New("EVENT_LIFECYCLE_REQUEST_DECIDED")
)

type LifecycleKind string
type LifecycleStatus string

const (
	KindCancelEvent LifecycleKind = "CANCEL_EVENT"
	KindStopSales   LifecycleKind = "STOP_SALES"

	LifecyclePending  LifecycleStatus = "PENDING"
	LifecycleApproved LifecycleStatus = "APPROVED"
	LifecycleRejected LifecycleStatus = "REJECTED"
)

type LifecycleRequest struct {
	ID                string           `json:"id"`
	EventID           string           `json:"eventId"`
	TicketTypeID      *string          `json:"ticketTypeId,omitempty"`
	Kind              LifecycleKind    `json:"kind"`
	Status            LifecycleStatus  `json:"status"`
	Reason            string           `json:"reason"`
	RequestedByUserID string           `json:"requestedByUserId"`
	RequestedAt       time.Time        `json:"requestedAt"`
	DecidedByUserID   *string          `json:"decidedByUserId,omitempty"`
	DecidedAt         *time.Time       `json:"decidedAt,omitempty"`
	DecisionReason    *string          `json:"decisionReason,omitempty"`
	EventTitle        string           `json:"eventTitle,omitempty"`
	OrganizerName     string           `json:"organizerName,omitempty"`
	TicketTypeName    string           `json:"ticketTypeName,omitempty"`
	CreatedAt         time.Time        `json:"createdAt"`
	UpdatedAt         time.Time        `json:"updatedAt"`
	Version           int              `json:"version"`
}

type QueueItem struct {
	Event
	OrganizerName string
}

type StaffAssignment struct {
	ID               string      `json:"id"`
	EventID          string      `json:"eventId"`
	UserID           string      `json:"userId"`
	Status           StaffStatus `json:"status"`
	AssignedByUserID string      `json:"assignedByUserId"`
	AssignedAt       time.Time   `json:"assignedAt"`
	RevokedByUserID  *string     `json:"revokedByUserId,omitempty"`
	RevokedAt        *time.Time  `json:"revokedAt,omitempty"`
	RevocationReason *string     `json:"revocationReason,omitempty"`
	CreatedAt        time.Time   `json:"createdAt"`
	UpdatedAt        time.Time   `json:"updatedAt"`
	Version          int         `json:"version"`
}

func AuthoringMutable(status Status) bool {
	return status == StatusDraft || status == StatusRejected
}

// DetailsEditable allows organizer to update published event copy and ticket commerce fields.
func DetailsEditable(status Status) bool {
	return AuthoringMutable(status) || status == StatusPublished
}

func Deletable(status Status) bool {
	return status == StatusDraft
}

func CanCancel(status Status) bool {
	return status == StatusPendingReview || status == StatusPublished || status == StatusRejected
}

func CanModerate(status Status) bool {
	return status == StatusPendingReview
}

func ReasonLengthOK(s string, min, max int) bool {
	n := utf8.RuneCountInString(strings.TrimSpace(s))
	return n >= min && n <= max
}

func IsEventOperator(ownerUserID string, organizerApproved bool, actorUserID string, assignmentActive bool) bool {
	if organizerApproved && ownerUserID != "" && ownerUserID == actorUserID {
		return true
	}
	return assignmentActive
}
