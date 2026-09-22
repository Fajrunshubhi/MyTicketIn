package domain

import "time"

type Event struct {
	ID               string
	Name             string
	OccurredAt       time.Time
	ReceivedAt       time.Time
	ActorUserID      *string
	AnonymousIDHash  *string
	EntityType       *string
	EntityID         *string
	ReasonCode       *string
	CorrelationID    string
	Properties       map[string]any
	SchemaVersion    int16
	DeduplicationKey *string
}
