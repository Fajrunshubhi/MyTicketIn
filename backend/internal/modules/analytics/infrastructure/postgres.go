package infrastructure

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"myticketin/internal/modules/analytics/domain"
	platdb "myticketin/internal/platform/db"
)

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *platdb.Pool) *Store {
	return &Store{pool: pool.Raw()}
}

func (s *Store) Insert(ctx context.Context, ev domain.Event) (bool, error) {
	props, err := json.Marshal(ev.Properties)
	if err != nil {
		return false, err
	}
	if ev.Properties == nil {
		props = []byte("{}")
	}
	var id string
	err = s.pool.QueryRow(ctx, `
		INSERT INTO analytics_events (
		  id, event_name, occurred_at, received_at, actor_user_id, anonymous_id_hash,
		  entity_type, entity_id, reason_code, correlation_id, properties, schema_version, deduplication_key
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)
		ON CONFLICT (deduplication_key) WHERE deduplication_key IS NOT NULL DO NOTHING
		RETURNING id`,
		ev.ID, ev.Name, ev.OccurredAt, ev.ReceivedAt, ev.ActorUserID, ev.AnonymousIDHash,
		ev.EntityType, ev.EntityID, ev.ReasonCode, ev.CorrelationID, jsonArg(props), ev.SchemaVersion, ev.DeduplicationKey,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func jsonArg(b []byte) any {
	if len(b) == 0 {
		return "{}"
	}
	return string(b)
}
