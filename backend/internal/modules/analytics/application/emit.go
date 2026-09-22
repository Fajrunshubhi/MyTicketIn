package application

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log/slog"
	"strings"
	"sync/atomic"
	"time"

	"myticketin/internal/modules/analytics/domain"
	platdb "myticketin/internal/platform/db"
	"myticketin/internal/platform/logger"
)

var (
	ErrInvalid     = errors.New("ANALYTICS_EVENT_INVALID")
	ErrNotAllowed  = errors.New("ANALYTICS_EVENT_NOT_ALLOWED")
	ErrTooLarge    = errors.New("ANALYTICS_EVENT_TOO_LARGE")
	ErrRateLimited = errors.New("ANALYTICS_RATE_LIMITED")
	ErrDegraded    = errors.New("ANALYTICS_DELIVERY_DEGRADED")
)

var allowedPropKeys = map[string]struct{}{
	"source":     {},
	"entityType": {},
	"entityId":   {},
	"reasonCode": {},
}

type Store interface {
	Insert(ctx context.Context, ev domain.Event) (inserted bool, err error)
}

type Metrics struct {
	Accepted atomic.Int64
	Deduped  atomic.Int64
	Dropped  atomic.Int64
}

type Emitter struct {
	Store   Store
	Log     *slog.Logger
	Metrics *Metrics
	Now     func() time.Time
}

type Input struct {
	Name             string
	OccurredAt       time.Time
	SchemaVersion    int16
	Properties       map[string]any
	DeduplicationKey string
	ActorUserID      string
	AnonymousSeed    string
	EntityType       string
	EntityID         string
	ReasonCode       string
	Client           bool
}

func (e *Emitter) Emit(ctx context.Context, in Input) error {
	spec, ok := domain.Lookup(in.Name)
	if !ok {
		e.drop()
		return ErrNotAllowed
	}
	if in.Client && !spec.ClientAllowed {
		e.drop()
		return ErrNotAllowed
	}
	if in.SchemaVersion != 0 && in.SchemaVersion != domain.SchemaVersion {
		e.drop()
		return ErrInvalid
	}
	props, reason, err := sanitizeProperties(in.Properties)
	if err != nil {
		e.drop()
		return err
	}
	if in.ReasonCode != "" {
		reason = in.ReasonCode
	}
	if in.EntityType == "" {
		if v, _ := props["entityType"].(string); v != "" {
			in.EntityType = v
		}
	}
	if in.EntityID == "" {
		if v, _ := props["entityId"].(string); v != "" {
			in.EntityID = v
		}
	}
	if reason == "" {
		if v, _ := props["reasonCode"].(string); v != "" {
			reason = v
		}
	}
	delete(props, "entityType")
	delete(props, "entityId")
	delete(props, "reasonCode")

	now := time.Now().UTC()
	if e.Now != nil {
		now = e.Now()
	}
	occurred := in.OccurredAt
	if occurred.IsZero() {
		occurred = now
	}
	if occurred.After(now.Add(5 * time.Minute)) {
		e.drop()
		return ErrInvalid
	}

	id, err := platdb.NewID()
	if err != nil {
		e.drop()
		return ErrDegraded
	}
	ev := domain.Event{
		ID:            id,
		Name:          in.Name,
		OccurredAt:    occurred,
		ReceivedAt:    now,
		CorrelationID: logger.CorrelationFrom(ctx),
		Properties:    props,
		SchemaVersion: domain.SchemaVersion,
	}
	if ev.CorrelationID == "" {
		ev.CorrelationID = "req_unavailable"
	}
	if in.ActorUserID != "" {
		uid := in.ActorUserID
		ev.ActorUserID = &uid
	} else if in.AnonymousSeed != "" {
		h := hashAnon(in.AnonymousSeed)
		ev.AnonymousIDHash = &h
	}
	if in.EntityType != "" {
		et := in.EntityType
		ev.EntityType = &et
	}
	if in.EntityID != "" {
		eid := in.EntityID
		ev.EntityID = &eid
	}
	if reason != "" {
		rc := reason
		ev.ReasonCode = &rc
	}
	if in.DeduplicationKey != "" {
		key := in.DeduplicationKey
		if len(key) > 160 {
			e.drop()
			return ErrInvalid
		}
		ev.DeduplicationKey = &key
	}

	timeout, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
	defer cancel()
	inserted, err := e.Store.Insert(timeout, ev)
	if err != nil {
		e.drop()
		if e.Log != nil {
			e.Log.Error("analytics delivery degraded",
				"eventName", in.Name,
				"correlationId", ev.CorrelationID,
			)
		}
		return ErrDegraded
	}
	if e.Metrics != nil {
		if inserted {
			e.Metrics.Accepted.Add(1)
		} else {
			e.Metrics.Deduped.Add(1)
		}
	}
	return nil
}

func (e *Emitter) drop() {
	if e.Metrics != nil {
		e.Metrics.Dropped.Add(1)
	}
}

func sanitizeProperties(in map[string]any) (map[string]any, string, error) {
	out := map[string]any{}
	reason := ""
	if in == nil {
		return out, reason, nil
	}
	for k, v := range in {
		if _, ok := allowedPropKeys[k]; !ok {
			lk := strings.ToLower(k)
			if strings.Contains(lk, "email") || strings.Contains(lk, "password") || strings.Contains(lk, "token") {
				return nil, "", ErrInvalid
			}
			return nil, "", ErrInvalid
		}
		s, ok := v.(string)
		if !ok {
			return nil, "", ErrInvalid
		}
		if len(s) > 200 {
			return nil, "", ErrTooLarge
		}
		out[k] = s
		if k == "reasonCode" {
			reason = s
		}
	}
	rawLen := 0
	for k, v := range out {
		rawLen += len(k) + len(v.(string))
	}
	if rawLen > 16*1024 {
		return nil, "", ErrTooLarge
	}
	return out, reason, nil
}

func hashAnon(seed string) string {
	sum := sha256.Sum256([]byte("anon|" + seed))
	return hex.EncodeToString(sum[:])
}

func BestEffort(ctx context.Context, e *Emitter, in Input) {
	if e == nil {
		return
	}
	_ = e.Emit(ctx, in)
}
