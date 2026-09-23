-- +goose Up
-- RFC-010 schema (goose 0011: RFC text said 0010, already used by payment sandbox).

CREATE TYPE ticket_status AS ENUM ('UNUSED', 'USED', 'CANCELLED');
CREATE TYPE ticket_cancellation_source AS ENUM ('EVENT_CANCELLED', 'REFUND_COMPLETED');
CREATE TYPE ticket_issuance_status AS ENUM ('STARTED', 'COMPLETED', 'FAILED');

CREATE TABLE ticket_issuance_runs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  status ticket_issuance_status NOT NULL DEFAULT 'STARTED',
  expected_quantity INTEGER NOT NULL,
  issued_quantity INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ NULL,
  failure_code VARCHAR(80) NULL,
  correlation_id VARCHAR(80) NOT NULL,
  CONSTRAINT ticket_issuance_runs_order_key UNIQUE (order_id),
  CONSTRAINT ticket_issuance_runs_qty_chk CHECK (expected_quantity > 0 AND issued_quantity BETWEEN 0 AND expected_quantity),
  CONSTRAINT ticket_issuance_runs_status_chk CHECK (
    (status = 'STARTED' AND completed_at IS NULL AND failure_code IS NULL)
    OR (status = 'COMPLETED' AND issued_quantity = expected_quantity AND completed_at IS NOT NULL AND failure_code IS NULL)
    OR (status = 'FAILED' AND failure_code IS NOT NULL)
  )
);
CREATE INDEX ticket_issuance_runs_status_started_idx ON ticket_issuance_runs (status, started_at, id);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  ticket_number VARCHAR(24) NOT NULL,
  manual_code CHAR(16) NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  ticket_type_id TEXT NOT NULL REFERENCES event_ticket_types(id) ON DELETE RESTRICT,
  ticket_type_name VARCHAR(120) NOT NULL,
  section_name VARCHAR(120) NULL,
  seat_label VARCHAR(32) NULL,
  event_seat_id TEXT NULL REFERENCES event_seats(id) ON DELETE RESTRICT,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  unit_sequence SMALLINT NOT NULL,
  status ticket_status NOT NULL DEFAULT 'UNUSED',
  token_hash CHAR(64) NOT NULL,
  token_ciphertext BYTEA NOT NULL,
  token_nonce BYTEA NOT NULL,
  token_auth_tag BYTEA NOT NULL,
  token_key_version SMALLINT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  cancellation_source ticket_cancellation_source NULL,
  cancellation_reference_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT tickets_ticket_number_key UNIQUE (ticket_number),
  CONSTRAINT tickets_manual_code_key UNIQUE (manual_code),
  CONSTRAINT tickets_token_hash_key UNIQUE (token_hash),
  CONSTRAINT tickets_order_item_unit_key UNIQUE (order_item_id, unit_sequence),
  CONSTRAINT tickets_unit_chk CHECK (unit_sequence BETWEEN 1 AND 5 AND token_key_version > 0 AND version > 0 AND octet_length(token_nonce) = 12 AND octet_length(token_auth_tag) = 16),
  CONSTRAINT tickets_status_fields_chk CHECK (
    (status = 'UNUSED' AND used_at IS NULL AND cancelled_at IS NULL AND cancellation_source IS NULL AND cancellation_reference_id IS NULL)
    OR (status = 'USED' AND used_at IS NOT NULL AND cancelled_at IS NULL AND cancellation_source IS NULL AND cancellation_reference_id IS NULL)
    OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancellation_source IS NOT NULL AND cancellation_reference_id IS NOT NULL AND used_at IS NULL)
  )
);
CREATE UNIQUE INDEX tickets_event_seat_paid_key ON tickets (event_seat_id) WHERE event_seat_id IS NOT NULL;
CREATE INDEX tickets_owner_issued_idx ON tickets (owner_user_id, issued_at DESC, id DESC);
CREATE INDEX tickets_event_status_idx ON tickets (event_id, status, issued_at, id);
CREATE INDEX tickets_order_idx ON tickets (order_id, order_item_id, unit_sequence);

ALTER TABLE auth_rate_limits DROP CONSTRAINT IF EXISTS auth_rate_limits_scope_chk;
ALTER TABLE auth_rate_limits
  ADD CONSTRAINT auth_rate_limits_scope_chk
  CHECK (scope IN (
    'register', 'login', 'oauth', 'analytics', 'organizer', 'event', 'ai', 'staff',
    'catalog', 'catalog-search', 'catalog-filters', 'catalog-detail', 'catalog-ai-min', 'catalog-ai-day',
    'checkout-summary', 'create-order', 'create-payment', 'webhook-payments', 'ticket-qr'
  ));

-- +goose Down
ALTER TABLE auth_rate_limits DROP CONSTRAINT IF EXISTS auth_rate_limits_scope_chk;
ALTER TABLE auth_rate_limits
  ADD CONSTRAINT auth_rate_limits_scope_chk
  CHECK (scope IN (
    'register', 'login', 'oauth', 'analytics', 'organizer', 'event', 'ai', 'staff',
    'catalog', 'catalog-search', 'catalog-filters', 'catalog-detail', 'catalog-ai-min', 'catalog-ai-day',
    'checkout-summary', 'create-order', 'create-payment', 'webhook-payments'
  ));
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS ticket_issuance_runs;
DROP TYPE IF EXISTS ticket_issuance_status;
DROP TYPE IF EXISTS ticket_cancellation_source;
DROP TYPE IF EXISTS ticket_status;
