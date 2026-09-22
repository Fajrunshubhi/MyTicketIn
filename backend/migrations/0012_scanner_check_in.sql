-- +goose Up
-- RFC-011 scanner/check-in (goose 0012: RFC text said 0011, already used by e-ticket).

-- +goose StatementBegin
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'check_in_result') THEN
    CREATE TYPE check_in_result AS ENUM ('VALID', 'ALREADY_USED', 'INVALID', 'CANCELLED', 'WRONG_EVENT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'check_in_input_type') THEN
    CREATE TYPE check_in_input_type AS ENUM ('QR_TOKEN', 'MANUAL_CODE');
  END IF;
END
$mig$;
-- +goose StatementEnd

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS used_by_user_id TEXT NULL REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_fields_chk;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_fields_chk CHECK (
  (status = 'UNUSED' AND used_at IS NULL AND used_by_user_id IS NULL AND cancelled_at IS NULL AND cancellation_source IS NULL AND cancellation_reference_id IS NULL)
  OR (status = 'USED' AND used_at IS NOT NULL AND used_by_user_id IS NOT NULL AND cancelled_at IS NULL AND cancellation_source IS NULL AND cancellation_reference_id IS NULL)
  OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancellation_source IS NOT NULL AND cancellation_reference_id IS NOT NULL AND used_at IS NULL AND used_by_user_id IS NULL)
);
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_used_actor_chk;
ALTER TABLE tickets ADD CONSTRAINT tickets_used_actor_chk CHECK (
  (status = 'USED' AND used_at IS NOT NULL AND used_by_user_id IS NOT NULL)
  OR (status <> 'USED' AND used_at IS NULL AND used_by_user_id IS NULL)
);
CREATE INDEX IF NOT EXISTS tickets_event_used_idx ON tickets (event_id, used_at DESC, id DESC) WHERE status = 'USED';

CREATE TABLE IF NOT EXISTS check_in_attempts (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  ticket_id TEXT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
  operator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  input_type check_in_input_type NOT NULL,
  result check_in_result NOT NULL,
  reason_code VARCHAR(80) NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  first_used_at TIMESTAMPTZ NULL,
  input_fingerprint CHAR(64) NOT NULL,
  idempotency_key_hash CHAR(64) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  correlation_id VARCHAR(80) NOT NULL,
  duration_ms INTEGER NOT NULL,
  client_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT check_in_attempts_duration_chk CHECK (duration_ms >= 0),
  CONSTRAINT check_in_attempts_context_chk CHECK (
    jsonb_typeof(client_context) = 'object'
    AND client_context - 'scannerVersion' - 'cameraFacing' - 'browserFamily' = '{}'::jsonb
  ),
  CONSTRAINT check_in_attempts_ticket_result_chk CHECK (
    (result IN ('VALID', 'ALREADY_USED', 'CANCELLED', 'WRONG_EVENT') AND ticket_id IS NOT NULL)
    OR result = 'INVALID'
  ),
  CONSTRAINT check_in_attempts_first_used_chk CHECK (
    (result IN ('VALID', 'ALREADY_USED') AND first_used_at IS NOT NULL)
    OR (result NOT IN ('VALID', 'ALREADY_USED') AND first_used_at IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS check_in_attempts_operator_event_key ON check_in_attempts (operator_user_id, event_id, idempotency_key_hash);
CREATE UNIQUE INDEX IF NOT EXISTS check_in_attempts_ticket_valid_key ON check_in_attempts (ticket_id) WHERE result = 'VALID';
CREATE INDEX IF NOT EXISTS check_in_attempts_event_time_idx ON check_in_attempts (event_id, attempted_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS check_in_attempts_operator_time_idx ON check_in_attempts (operator_user_id, attempted_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS check_in_attempts_ticket_time_idx ON check_in_attempts (ticket_id, attempted_at DESC, id DESC) WHERE ticket_id IS NOT NULL;

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION check_in_attempts_immutable() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'CHECKIN_ATTEMPT_IMMUTABLE' USING ERRCODE = 'P0001';
END;
$fn$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS check_in_attempts_immutable ON check_in_attempts;
CREATE TRIGGER check_in_attempts_immutable
  BEFORE UPDATE OR DELETE ON check_in_attempts
  FOR EACH ROW EXECUTE FUNCTION check_in_attempts_immutable();

ALTER TABLE auth_rate_limits DROP CONSTRAINT IF EXISTS auth_rate_limits_scope_chk;
ALTER TABLE auth_rate_limits
  ADD CONSTRAINT auth_rate_limits_scope_chk
  CHECK (scope IN (
    'register', 'login', 'oauth', 'analytics', 'organizer', 'event', 'ai', 'staff',
    'catalog', 'catalog-search', 'catalog-filters', 'catalog-detail', 'catalog-ai-min', 'catalog-ai-day',
    'checkout-summary', 'create-order', 'create-payment', 'webhook-payments', 'ticket-qr',
    'checkin-qr', 'checkin-manual', 'checkin-invalid'
  ));

-- +goose Down
DROP TRIGGER IF EXISTS check_in_attempts_immutable ON check_in_attempts;
DROP FUNCTION IF EXISTS check_in_attempts_immutable();
DROP TABLE IF EXISTS check_in_attempts;
DROP INDEX IF EXISTS tickets_event_used_idx;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_used_actor_chk;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_fields_chk;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_fields_chk CHECK (
  (status = 'UNUSED' AND used_at IS NULL AND cancelled_at IS NULL AND cancellation_source IS NULL AND cancellation_reference_id IS NULL)
  OR (status = 'USED' AND used_at IS NOT NULL AND cancelled_at IS NULL AND cancellation_source IS NULL AND cancellation_reference_id IS NULL)
  OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancellation_source IS NOT NULL AND cancellation_reference_id IS NOT NULL AND used_at IS NULL)
);
ALTER TABLE tickets DROP COLUMN IF EXISTS used_by_user_id;
DROP TYPE IF EXISTS check_in_input_type;
DROP TYPE IF EXISTS check_in_result;
ALTER TABLE auth_rate_limits DROP CONSTRAINT IF EXISTS auth_rate_limits_scope_chk;
ALTER TABLE auth_rate_limits
  ADD CONSTRAINT auth_rate_limits_scope_chk
  CHECK (scope IN (
    'register', 'login', 'oauth', 'analytics', 'organizer', 'event', 'ai', 'staff',
    'catalog', 'catalog-search', 'catalog-filters', 'catalog-detail', 'catalog-ai-min', 'catalog-ai-day',
    'checkout-summary', 'create-order', 'create-payment', 'webhook-payments', 'ticket-qr'
  ));
