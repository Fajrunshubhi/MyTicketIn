-- +goose Up
CREATE TYPE audit_actor_type AS ENUM ('USER', 'SYSTEM', 'ANONYMOUS');
CREATE TYPE audit_outcome AS ENUM ('SUCCESS', 'REJECTED', 'FAILED');

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_type audit_actor_type NOT NULL,
  actor_user_id TEXT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id TEXT NULL,
  outcome audit_outcome NOT NULL,
  reason_code VARCHAR(80) NULL,
  correlation_id VARCHAR(80) NOT NULL,
  before_data JSONB NULL,
  after_data JSONB NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  schema_version SMALLINT NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  CONSTRAINT audit_logs_actor_chk CHECK (
    (actor_type = 'USER' AND actor_user_id IS NOT NULL)
    OR (actor_type IN ('SYSTEM', 'ANONYMOUS') AND actor_user_id IS NULL)
  ),
  CONSTRAINT audit_logs_json_obj_chk CHECK (
    (before_data IS NULL OR jsonb_typeof(before_data) = 'object')
    AND (after_data IS NULL OR jsonb_typeof(after_data) = 'object')
    AND jsonb_typeof(metadata) = 'object'
  )
);

CREATE INDEX audit_logs_occurred_id_idx ON audit_logs (occurred_at DESC, id DESC);
CREATE INDEX audit_logs_actor_occurred_idx ON audit_logs (actor_user_id, occurred_at DESC);
CREATE INDEX audit_logs_entity_occurred_idx ON audit_logs (entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_logs_action_occurred_idx ON audit_logs (action, occurred_at DESC);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is immutable';
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

CREATE TRIGGER audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

CREATE TABLE analytics_events (
  id TEXT PRIMARY KEY,
  event_name VARCHAR(100) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  anonymous_id_hash CHAR(64) NULL,
  entity_type VARCHAR(60) NULL,
  entity_id TEXT NULL,
  reason_code VARCHAR(80) NULL,
  correlation_id VARCHAR(80) NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  schema_version SMALLINT NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  deduplication_key VARCHAR(160) NULL,
  CONSTRAINT analytics_events_one_actor_chk CHECK (
    NOT (actor_user_id IS NOT NULL AND anonymous_id_hash IS NOT NULL)
  ),
  CONSTRAINT analytics_events_props_obj_chk CHECK (jsonb_typeof(properties) = 'object')
);

CREATE UNIQUE INDEX analytics_events_dedup_key ON analytics_events (deduplication_key) WHERE deduplication_key IS NOT NULL;
CREATE INDEX analytics_events_name_occurred_idx ON analytics_events (event_name, occurred_at DESC);
CREATE INDEX analytics_events_actor_occurred_idx ON analytics_events (actor_user_id, occurred_at DESC);
CREATE INDEX analytics_events_received_idx ON analytics_events (received_at DESC);

-- +goose StatementBegin
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'auth_rate_limits'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%scope%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE auth_rate_limits DROP CONSTRAINT %I', cname);
  END IF;
END $$;
-- +goose StatementEnd

ALTER TABLE auth_rate_limits
  ADD CONSTRAINT auth_rate_limits_scope_chk
  CHECK (scope IN ('register', 'login', 'oauth', 'analytics'));

-- +goose Down
ALTER TABLE auth_rate_limits DROP CONSTRAINT IF EXISTS auth_rate_limits_scope_chk;
ALTER TABLE auth_rate_limits
  ADD CONSTRAINT auth_rate_limits_scope_chk
  CHECK (scope IN ('register', 'login', 'oauth'));
DROP TABLE IF EXISTS analytics_events;
DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;
DROP FUNCTION IF EXISTS audit_logs_immutable();
DROP TABLE IF EXISTS audit_logs;
DROP TYPE IF EXISTS audit_outcome;
DROP TYPE IF EXISTS audit_actor_type;
