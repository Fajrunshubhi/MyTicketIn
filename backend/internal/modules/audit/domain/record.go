package domain

import "time"

const SchemaVersion int16 = 1

type ActorType string

const (
	ActorUser      ActorType = "USER"
	ActorSystem    ActorType = "SYSTEM"
	ActorAnonymous ActorType = "ANONYMOUS"
)

type Outcome string

const (
	OutcomeSuccess  Outcome = "SUCCESS"
	OutcomeRejected Outcome = "REJECTED"
	OutcomeFailed   Outcome = "FAILED"
)

type Record struct {
	ID            string
	OccurredAt    time.Time
	ActorType     ActorType
	ActorUserID   *string
	Action        string
	EntityType    string
	EntityID      *string
	Outcome       Outcome
	ReasonCode    *string
	CorrelationID string
	Before        map[string]any
	After         map[string]any
	Metadata      map[string]any
	SchemaVersion int16
}

type Filter struct {
	Action      string
	EntityType  string
	EntityID    string
	ActorUserID string
	Outcome     string
	From        *time.Time
	To          *time.Time
	CursorTime  *time.Time
	CursorID    string
	Limit       int
}

type Summary struct {
	ID            string
	OccurredAt    time.Time
	ActorType     ActorType
	ActorUserID   *string
	Action        string
	EntityType    string
	EntityID      *string
	Outcome       Outcome
	ReasonCode    *string
	CorrelationID string
	SchemaVersion int16
}

type Detail struct {
	Summary
	Before   map[string]any
	After    map[string]any
	Metadata map[string]any
}
