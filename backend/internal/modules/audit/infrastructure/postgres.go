package infrastructure

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"myticketin/internal/modules/audit/domain"
	platdb "myticketin/internal/platform/db"
)

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *platdb.Pool) *Store {
	return &Store{pool: pool.Raw()}
}

func (s *Store) Insert(ctx context.Context, rec domain.Record) error {
	before, err := marshalNullable(rec.Before)
	if err != nil {
		return err
	}
	after, err := marshalNullable(rec.After)
	if err != nil {
		return err
	}
	meta, err := json.Marshal(rec.Metadata)
	if err != nil {
		return err
	}
	if rec.Metadata == nil {
		meta = []byte("{}")
	}
	_, err = exec(ctx, s, `
		INSERT INTO audit_logs (
		  id, occurred_at, actor_type, actor_user_id, action, entity_type, entity_id,
		  outcome, reason_code, correlation_id, before_data, after_data, metadata, schema_version
		) VALUES (
		  $1,$2,$3::audit_actor_type,$4,$5,$6,$7,$8::audit_outcome,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14
		)`,
		rec.ID, rec.OccurredAt, string(rec.ActorType), rec.ActorUserID, rec.Action, rec.EntityType, rec.EntityID,
		string(rec.Outcome), rec.ReasonCode, rec.CorrelationID, jsonArg(before), jsonArg(after), jsonArg(meta), rec.SchemaVersion)
	return err
}

func (s *Store) Get(ctx context.Context, id string) (domain.Detail, error) {
	row := rowQ(ctx, s, `
		SELECT id, occurred_at, actor_type::text, actor_user_id, action, entity_type, entity_id,
		       outcome::text, reason_code, correlation_id, before_data, after_data, metadata, schema_version
		FROM audit_logs WHERE id = $1`, id)
	var d domain.Detail
	var before, after, meta []byte
	var actorType, outcome string
	err := row.Scan(&d.ID, &d.OccurredAt, &actorType, &d.ActorUserID, &d.Action, &d.EntityType, &d.EntityID,
		&outcome, &d.ReasonCode, &d.CorrelationID, &before, &after, &meta, &d.SchemaVersion)
	if errors.Is(err, pgx.ErrNoRows) || err != nil {
		return domain.Detail{}, err
	}
	d.ActorType = domain.ActorType(actorType)
	d.Outcome = domain.Outcome(outcome)
	d.Before = decodeObj(before)
	d.After = decodeObj(after)
	d.Metadata = decodeObj(meta)
	if d.Metadata == nil {
		d.Metadata = map[string]any{}
	}
	return d, nil
}

func (s *Store) List(ctx context.Context, f domain.Filter) ([]domain.Summary, error) {
	rows, err := query(ctx, s, `
		SELECT id, occurred_at, actor_type::text, actor_user_id, action, entity_type, entity_id,
		       outcome::text, reason_code, correlation_id, schema_version
		FROM audit_logs
		WHERE ($1::text = '' OR action = $1)
		  AND ($2::text = '' OR entity_type = $2)
		  AND ($3::text = '' OR entity_id = $3)
		  AND ($4::text = '' OR actor_user_id = $4)
		  AND ($5::text = '' OR outcome::text = $5)
		  AND ($6::timestamptz IS NULL OR occurred_at >= $6)
		  AND ($7::timestamptz IS NULL OR occurred_at <= $7)
		  AND ($8::timestamptz IS NULL OR (occurred_at, id) < ($8, $9))
		ORDER BY occurred_at DESC, id DESC
		LIMIT $10`,
		f.Action, f.EntityType, f.EntityID, f.ActorUserID, f.Outcome,
		f.From, f.To, f.CursorTime, f.CursorID, f.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Summary
	for rows.Next() {
		var srow domain.Summary
		var actorType, outcome string
		if err := rows.Scan(&srow.ID, &srow.OccurredAt, &actorType, &srow.ActorUserID, &srow.Action, &srow.EntityType, &srow.EntityID,
			&outcome, &srow.ReasonCode, &srow.CorrelationID, &srow.SchemaVersion); err != nil {
			return nil, err
		}
		srow.ActorType = domain.ActorType(actorType)
		srow.Outcome = domain.Outcome(outcome)
		out = append(out, srow)
	}
	return out, rows.Err()
}

func marshalNullable(m map[string]any) ([]byte, error) {
	if m == nil {
		return nil, nil
	}
	return json.Marshal(m)
}

func jsonArg(b []byte) any {
	if len(b) == 0 {
		return nil
	}
	return string(b)
}

func decodeObj(b []byte) map[string]any {
	if len(b) == 0 {
		return nil
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		return map[string]any{}
	}
	return m
}

func exec(ctx context.Context, s *Store, sql string, args ...any) (interface{}, error) {
	if tx := platdb.TxFrom(ctx); tx != nil {
		return tx.Exec(ctx, sql, args...)
	}
	return s.pool.Exec(ctx, sql, args...)
}

func rowQ(ctx context.Context, s *Store, sql string, args ...any) pgx.Row {
	if tx := platdb.TxFrom(ctx); tx != nil {
		return tx.QueryRow(ctx, sql, args...)
	}
	return s.pool.QueryRow(ctx, sql, args...)
}

func query(ctx context.Context, s *Store, sql string, args ...any) (pgx.Rows, error) {
	if tx := platdb.TxFrom(ctx); tx != nil {
		return tx.Query(ctx, sql, args...)
	}
	return s.pool.Query(ctx, sql, args...)
}
