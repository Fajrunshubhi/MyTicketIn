package domain

import "time"

type Profile struct {
	ID              string
	OwnerUserID     string
	Name            string
	ContactEmail    string
	ContactPhone    *string
	Description     string
	Status          Status
	DecisionReason  *string
	SubmittedAt     time.Time
	DecidedAt       *time.Time
	DecidedByUserID *string
	CreatedAt       time.Time
	UpdatedAt       time.Time
	Version         int
}
