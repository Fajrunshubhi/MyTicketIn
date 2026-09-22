package domain

import (
	"errors"
	"time"
)

const (
	RoleUser  = "USER"
	RoleAdmin = "ADMIN"

	StatusActive    = "ACTIVE"
	StatusSuspended = "SUSPENDED"
	StatusDisabled  = "DISABLED"

	SessionTTL = 8 * time.Hour
)

var (
	ErrInvalidCredentials  = errors.New("AUTH_INVALID_CREDENTIALS")
	ErrRequired            = errors.New("AUTH_REQUIRED")
	ErrSessionExpired      = errors.New("AUTH_SESSION_EXPIRED")
	ErrAccountSuspended    = errors.New("AUTH_ACCOUNT_SUSPENDED")
	ErrAccountDisabled     = errors.New("AUTH_ACCOUNT_DISABLED")
	ErrAccountLinkRequired = errors.New("AUTH_ACCOUNT_LINK_REQUIRED")
	ErrOAuthFailed         = errors.New("AUTH_OAUTH_FAILED")
	ErrForbidden           = errors.New("AUTH_FORBIDDEN")
	ErrCSRFInvalid         = errors.New("AUTH_CSRF_INVALID")
	ErrRateLimited         = errors.New("AUTH_RATE_LIMITED")
	ErrUsernameExists      = errors.New("USERNAME_ALREADY_EXISTS")
	ErrEmailExists         = errors.New("EMAIL_ALREADY_EXISTS")
	ErrValidation          = errors.New("VALIDATION_ERROR")
	ErrUnavailable         = errors.New("AUTH_SERVICE_UNAVAILABLE")
	ErrPortalDenied        = errors.New("AUTH_PORTAL_DENIED")
)

const (
	PortalBuyer     = "buyer"
	PortalOrganizer = "organizer"
	PortalAdmin     = "admin"

	PortalDeniedNotAdmin        = "not_admin"
	PortalDeniedAdminOnly       = "admin_only"
	PortalDeniedOrganizerOnly   = "organizer_only"
	PortalDeniedApplyAfterLogin = "apply_after_login"
)

type PortalDeniedError struct {
	Reason string
}

func (e PortalDeniedError) Error() string { return ErrPortalDenied.Error() }

func (e PortalDeniedError) Unwrap() error { return ErrPortalDenied }

type User struct {
	ID           string
	Name         string
	Username     string
	Email        string
	PasswordHash *string
	Role         string
	Status       string
	AuthVersion  int
	CreatedAt    time.Time
}

func (u User) IsActive() bool {
	return u.Status == StatusActive
}

type PasswordResetToken struct {
	ID        string
	UserID    string
	ExpiresAt time.Time
	UsedAt    *time.Time
	RevokedAt *time.Time
}

type Session struct {
	ID          string
	UserID      string
	TokenHash   string
	CSRFHash    string
	AuthVersion int
	ExpiresAt   time.Time
}

type GoogleProfile struct {
	Subject       string
	Email         string
	EmailVerified bool
	Name          string
}

type Actor struct {
	User User
}

type Resource struct {
	Kind    string
	ID      string
	OwnerID string
}
