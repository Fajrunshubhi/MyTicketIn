package application

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"myticketin/internal/modules/audit/domain"
	platdb "myticketin/internal/platform/db"
	"myticketin/internal/platform/logger"
)

var (
	ErrWriteFailed   = errors.New("AUDIT_WRITE_FAILED")
	ErrNotFound      = errors.New("AUDIT_LOG_NOT_FOUND")
	ErrFilterInvalid = errors.New("AUDIT_FILTER_INVALID")
	ErrCursorInvalid = errors.New("CURSOR_INVALID")
)

type WriterStore interface {
	Insert(ctx context.Context, rec domain.Record) error
	Get(ctx context.Context, id string) (domain.Detail, error)
	List(ctx context.Context, f domain.Filter) ([]domain.Summary, error)
}

type Writer struct {
	Store WriterStore
	Log   *slog.Logger
	Now   func() time.Time
}

func (w *Writer) Record(ctx context.Context, rec domain.Record) error {
	if rec.Action == "" || rec.EntityType == "" || rec.Outcome == "" || rec.ActorType == "" {
		return ErrWriteFailed
	}
	if rec.ActorType == domain.ActorUser && (rec.ActorUserID == nil || *rec.ActorUserID == "") {
		return ErrWriteFailed
	}
	if rec.ActorType != domain.ActorUser && rec.ActorUserID != nil {
		return ErrWriteFailed
	}
	before, err := SanitizeMap(rec.Before)
	if err != nil {
		return err
	}
	after, err := SanitizeMap(rec.After)
	if err != nil {
		return err
	}
	meta, err := SanitizeMap(rec.Metadata)
	if err != nil {
		return err
	}
	if meta == nil {
		meta = map[string]any{}
	}
	if rec.ID == "" {
		id, err := platdb.NewID()
		if err != nil {
			return ErrWriteFailed
		}
		rec.ID = id
	}
	if rec.OccurredAt.IsZero() {
		if w.Now != nil {
			rec.OccurredAt = w.Now()
		} else {
			rec.OccurredAt = time.Now().UTC()
		}
	}
	if rec.CorrelationID == "" {
		rec.CorrelationID = logger.CorrelationFrom(ctx)
	}
	if rec.CorrelationID == "" {
		rec.CorrelationID = "req_unavailable"
	}
	if rec.SchemaVersion == 0 {
		rec.SchemaVersion = domain.SchemaVersion
	}
	rec.Before = before
	rec.After = after
	rec.Metadata = meta
	if err := w.Store.Insert(ctx, rec); err != nil {
		if w.Log != nil {
			w.Log.Error("audit write failed",
				"auditId", rec.ID,
				"action", rec.Action,
				"outcome", rec.Outcome,
				"correlationId", rec.CorrelationID,
				"err", err.Error(),
			)
		}
		return ErrWriteFailed
	}
	if w.Log != nil {
		w.Log.Info("audit written",
			"auditId", rec.ID,
			"action", rec.Action,
			"outcome", rec.Outcome,
			"correlationId", rec.CorrelationID,
		)
	}
	return nil
}
