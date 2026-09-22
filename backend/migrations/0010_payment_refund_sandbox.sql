-- +goose Up
-- RFC-009 schema (goose 0010: 0009 already used for catalog/checkout rate-limit scopes).

CREATE TYPE payment_status AS ENUM ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'REFUNDED');
CREATE TYPE payment_method AS ENUM ('QRIS', 'VIRTUAL_ACCOUNT', 'EWALLET');
CREATE TYPE webhook_processing_status AS ENUM ('RECEIVED', 'PROCESSED', 'REJECTED', 'FAILED');
CREATE TYPE reconciliation_status AS ENUM ('OPEN', 'RESOLVED_ACCEPTED', 'RESOLVED_REJECTED');
CREATE TYPE refund_status AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE idempotency_keys DROP CONSTRAINT IF EXISTS idempotency_keys_scope_check;
ALTER TABLE idempotency_keys DROP CONSTRAINT IF EXISTS idempotency_keys_scope_chk;
-- +goose StatementBegin
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'idempotency_keys'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%CREATE_ORDER%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE idempotency_keys DROP CONSTRAINT %I', cname);
  END IF;
END $$;
-- +goose StatementEnd
ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_scope_chk
  CHECK (scope IN ('CREATE_ORDER','CREATE_PAYMENT','RESOLVE_RECONCILIATION','CREATE_REFUND','DECIDE_REFUND'));

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS loyalty_earned_points BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_reversed_points BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_redeemed_restored BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_loyalty_settlement_chk;
ALTER TABLE orders ADD CONSTRAINT orders_loyalty_settlement_chk CHECK (
  loyalty_earned_points >= 0 AND loyalty_reversed_points >= 0
  AND loyalty_reversed_points <= loyalty_earned_points
  AND (
    loyalty_redeemed_restored = FALSE
    OR (loyalty_redeemed_restored = TRUE AND redeemed_points > 0 AND status = 'REFUNDED')
  )
);
CREATE INDEX IF NOT EXISTS orders_loyalty_refund_idx ON orders (id, loyalty_reversed_points)
  WHERE loyalty_earned_points > 0 OR redeemed_points > 0;

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider VARCHAR(40) NOT NULL,
  environment VARCHAR(12) NOT NULL DEFAULT 'SANDBOX',
  external_reference VARCHAR(191) NULL,
  provider_idempotency_key VARCHAR(128) NOT NULL,
  method payment_method NOT NULL,
  amount_rupiah BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'IDR',
  status payment_status NOT NULL DEFAULT 'CREATED',
  instruction_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_payload_hash CHAR(64) NULL,
  failure_code VARCHAR(80) NULL,
  provider_expires_at TIMESTAMPTZ NULL,
  succeeded_at TIMESTAMPTZ NULL,
  failed_at TIMESTAMPTZ NULL,
  refunded_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT payments_order_key UNIQUE (order_id),
  CONSTRAINT payments_provider_idempotency_key UNIQUE (provider, provider_idempotency_key),
  CONSTRAINT payments_sandbox_chk CHECK (environment = 'SANDBOX' AND amount_rupiah >= 0 AND currency = 'IDR' AND version > 0 AND jsonb_typeof(instruction_data) = 'object'),
  CONSTRAINT payments_terminal_ts_chk CHECK (
    (status IN ('CREATED','PENDING') AND succeeded_at IS NULL AND failed_at IS NULL AND refunded_at IS NULL)
    OR (status = 'SUCCEEDED' AND succeeded_at IS NOT NULL AND failed_at IS NULL AND refunded_at IS NULL)
    OR (status = 'FAILED' AND failed_at IS NOT NULL AND succeeded_at IS NULL AND refunded_at IS NULL)
    OR (status = 'EXPIRED' AND failed_at IS NOT NULL AND succeeded_at IS NULL AND refunded_at IS NULL)
    OR (status = 'REFUNDED' AND succeeded_at IS NOT NULL AND refunded_at IS NOT NULL AND failed_at IS NULL)
  )
);
CREATE UNIQUE INDEX payments_external_reference_key ON payments (provider, external_reference) WHERE external_reference IS NOT NULL;
CREATE INDEX payments_status_updated_idx ON payments (status, updated_at, id);

CREATE TABLE payment_webhook_events (
  id TEXT PRIMARY KEY,
  provider VARCHAR(40) NOT NULL,
  external_event_id VARCHAR(191) NOT NULL,
  external_reference VARCHAR(191) NULL,
  payload_hash CHAR(64) NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  processing_status webhook_processing_status NOT NULL,
  mapped_status payment_status NULL,
  reason_code VARCHAR(80) NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMPTZ NULL,
  correlation_id VARCHAR(80) NOT NULL,
  sanitized_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT payment_webhook_events_provider_event_key UNIQUE (provider, external_event_id),
  CONSTRAINT payment_webhook_payload_chk CHECK (jsonb_typeof(sanitized_payload) = 'object'),
  CONSTRAINT payment_webhook_processed_chk CHECK (
    (processing_status IN ('PROCESSED','REJECTED') AND processed_at IS NOT NULL)
    OR (processing_status IN ('RECEIVED','FAILED'))
  )
);
CREATE INDEX payment_webhook_events_reference_idx ON payment_webhook_events (provider, external_reference, received_at DESC);
CREATE INDEX payment_webhook_events_status_idx ON payment_webhook_events (processing_status, received_at, id);

CREATE TABLE payment_reconciliations (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  webhook_event_id TEXT NOT NULL REFERENCES payment_webhook_events(id) ON DELETE RESTRICT,
  reason_code VARCHAR(80) NOT NULL CHECK (reason_code IN ('LATE_SUCCESS','AMOUNT_MISMATCH','ORDER_STATE_MISMATCH','REFERENCE_MISMATCH')),
  status reconciliation_status NOT NULL DEFAULT 'OPEN',
  provider_amount_rupiah BIGINT NULL,
  notes VARCHAR(1000) NULL,
  resolved_by_user_id TEXT NULL REFERENCES users(id) ON DELETE RESTRICT,
  resolved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT payment_reconciliations_webhook_key UNIQUE (webhook_event_id),
  CONSTRAINT payment_reconciliations_resolve_chk CHECK (
    (status = 'OPEN' AND resolved_by_user_id IS NULL AND resolved_at IS NULL AND notes IS NULL)
    OR (status IN ('RESOLVED_ACCEPTED','RESOLVED_REJECTED') AND resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL AND char_length(btrim(notes)) BETWEEN 10 AND 1000)
  )
);
CREATE INDEX payment_reconciliations_open_idx ON payment_reconciliations (created_at, id) WHERE status = 'OPEN';

CREATE TABLE refunds (
  id TEXT PRIMARY KEY,
  refund_number VARCHAR(24) NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  amount_rupiah BIGINT NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  status refund_status NOT NULL DEFAULT 'REQUESTED',
  requested_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decided_by_user_id TEXT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision_reason VARCHAR(1000) NULL,
  external_reference VARCHAR(191) NULL,
  provider_payload_hash CHAR(64) NULL,
  provider_event_id VARCHAR(191) NULL,
  loyalty_processed_at TIMESTAMPTZ NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT refunds_refund_number_key UNIQUE (refund_number),
  CONSTRAINT refunds_amount_chk CHECK (amount_rupiah > 0 AND version > 0 AND char_length(btrim(reason)) BETWEEN 10 AND 1000),
  CONSTRAINT refunds_loyalty_processed_chk CHECK (loyalty_processed_at IS NULL OR status = 'COMPLETED')
);
CREATE UNIQUE INDEX refunds_external_reference_key ON refunds (payment_id, external_reference) WHERE external_reference IS NOT NULL;
CREATE UNIQUE INDEX refunds_provider_event_key ON refunds (payment_id, provider_event_id) WHERE provider_event_id IS NOT NULL;
CREATE INDEX refunds_payment_status_idx ON refunds (payment_id, status, created_at, id);
CREATE INDEX refunds_status_created_idx ON refunds (status, created_at, id);

ALTER TABLE loyalty_ledger_entries
  ADD CONSTRAINT loyalty_ledger_refund_fk FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE RESTRICT;
ALTER TABLE loyalty_ledger_entries DROP CONSTRAINT IF EXISTS loyalty_ledger_refund_chk;
ALTER TABLE loyalty_ledger_entries ADD CONSTRAINT loyalty_ledger_refund_chk CHECK (
  (entry_type IN ('EARN', 'REDEEM_DEBIT') AND refund_id IS NULL)
  OR (entry_type IN ('EARN_REVERSAL', 'REDEEM_RESTORE') AND refund_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_ledger_full_restore_key
  ON loyalty_ledger_entries (order_id, entry_type) WHERE entry_type = 'REDEEM_RESTORE';

ALTER TABLE auth_rate_limits DROP CONSTRAINT IF EXISTS auth_rate_limits_scope_chk;
ALTER TABLE auth_rate_limits
  ADD CONSTRAINT auth_rate_limits_scope_chk
  CHECK (scope IN (
    'register', 'login', 'oauth', 'analytics', 'organizer', 'event', 'ai', 'staff',
    'catalog', 'catalog-search', 'catalog-filters', 'catalog-detail', 'catalog-ai-min', 'catalog-ai-day',
    'checkout-summary', 'create-order', 'create-payment', 'webhook-payments'
  ));

-- +goose Down
DROP INDEX IF EXISTS loyalty_ledger_full_restore_key;
ALTER TABLE loyalty_ledger_entries DROP CONSTRAINT IF EXISTS loyalty_ledger_refund_fk;
DROP TABLE IF EXISTS refunds;
DROP TABLE IF EXISTS payment_reconciliations;
DROP TABLE IF EXISTS payment_webhook_events;
DROP TABLE IF EXISTS payments;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_loyalty_settlement_chk;
DROP INDEX IF EXISTS orders_loyalty_refund_idx;
ALTER TABLE orders DROP COLUMN IF EXISTS loyalty_redeemed_restored;
ALTER TABLE orders DROP COLUMN IF EXISTS loyalty_reversed_points;
ALTER TABLE orders DROP COLUMN IF EXISTS loyalty_earned_points;
ALTER TABLE idempotency_keys DROP CONSTRAINT IF EXISTS idempotency_keys_scope_chk;
ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_scope_chk CHECK (scope IN ('CREATE_ORDER'));
DROP TYPE IF EXISTS refund_status;
DROP TYPE IF EXISTS reconciliation_status;
DROP TYPE IF EXISTS webhook_processing_status;
DROP TYPE IF EXISTS payment_method;
DROP TYPE IF EXISTS payment_status;
