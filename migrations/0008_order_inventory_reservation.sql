-- +goose Up
CREATE TYPE order_status AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED');
CREATE TYPE idempotency_status AS ENUM ('PROCESSING', 'COMPLETED');
CREATE TYPE loyalty_entry_type AS ENUM ('EARN', 'REDEEM_DEBIT', 'EARN_REVERSAL', 'REDEEM_RESTORE');
CREATE TYPE loyalty_reservation_status AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED');
CREATE TYPE loyalty_release_reason AS ENUM ('ORDER_EXPIRED', 'ORDER_FAILED', 'ORDER_CANCELLED', 'EVENT_CANCELLED', 'PAYMENT_FAILED', 'PAYMENT_EXPIRED');

ALTER TABLE event_ticket_types
  ADD COLUMN IF NOT EXISTS reserved_quantity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_quantity INTEGER NOT NULL DEFAULT 0;

ALTER TABLE event_ticket_types DROP CONSTRAINT IF EXISTS ticket_types_inventory_nonnegative_chk;
ALTER TABLE event_ticket_types ADD CONSTRAINT ticket_types_inventory_nonnegative_chk
  CHECK (reserved_quantity >= 0 AND paid_quantity >= 0);
ALTER TABLE event_ticket_types DROP CONSTRAINT IF EXISTS ticket_types_inventory_quota_chk;
ALTER TABLE event_ticket_types ADD CONSTRAINT ticket_types_inventory_quota_chk
  CHECK (reserved_quantity + paid_quantity <= quota);

CREATE INDEX IF NOT EXISTS event_ticket_types_availability_idx
  ON event_ticket_types (event_id, id, reserved_quantity, paid_quantity);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  order_number VARCHAR(24) NOT NULL,
  buyer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  status order_status NOT NULL DEFAULT 'PENDING',
  currency CHAR(3) NOT NULL DEFAULT 'IDR',
  subtotal_rupiah BIGINT NOT NULL,
  loyalty_discount_rupiah BIGINT NOT NULL DEFAULT 0,
  total_payable_rupiah BIGINT NOT NULL,
  loyalty_account_id TEXT NULL,
  redeemed_points BIGINT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  expired_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  cancellation_reason VARCHAR(500) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT orders_order_number_key UNIQUE (order_number),
  CONSTRAINT orders_money_chk CHECK (
    subtotal_rupiah >= 0 AND loyalty_discount_rupiah >= 0 AND total_payable_rupiah >= 0
    AND subtotal_rupiah <= 9000000000000
    AND total_payable_rupiah = subtotal_rupiah - loyalty_discount_rupiah
    AND loyalty_discount_rupiah <= (subtotal_rupiah / 5)
    AND currency = 'IDR'
  ),
  CONSTRAINT orders_expiry_window_chk CHECK (expires_at = created_at + INTERVAL '15 minutes'),
  CONSTRAINT orders_terminal_fields_chk CHECK (
    (status = 'EXPIRED' AND expired_at IS NOT NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL)
    OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL AND expired_at IS NULL)
    OR (status NOT IN ('EXPIRED', 'CANCELLED') AND expired_at IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL)
  ),
  CONSTRAINT orders_loyalty_snapshot_chk CHECK (
    redeemed_points BETWEEN 0 AND 180000000000
    AND loyalty_discount_rupiah = redeemed_points * 10
    AND (
      (loyalty_account_id IS NULL AND redeemed_points = 0)
      OR (loyalty_account_id IS NOT NULL AND redeemed_points > 0)
    )
  )
);

CREATE INDEX orders_buyer_created_idx ON orders (buyer_user_id, created_at DESC, id DESC);
CREATE INDEX orders_event_status_idx ON orders (event_id, status, created_at DESC, id DESC);
CREATE INDEX orders_expiry_due_idx ON orders (expires_at, id) WHERE status = 'PENDING';
CREATE INDEX orders_loyalty_account_idx ON orders (loyalty_account_id, created_at DESC, id DESC) WHERE loyalty_account_id IS NOT NULL;

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  ticket_type_id TEXT NOT NULL REFERENCES event_ticket_types(id) ON DELETE RESTRICT,
  ticket_type_name VARCHAR(120) NOT NULL,
  section_name VARCHAR(120) NULL,
  seat_label VARCHAR(32) NULL,
  event_seat_id TEXT NULL REFERENCES event_seats(id) ON DELETE RESTRICT,
  unit_price_rupiah BIGINT NOT NULL CHECK (unit_price_rupiah >= 0),
  quantity SMALLINT NOT NULL CHECK (quantity BETWEEN 1 AND 5),
  line_total_rupiah BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT order_items_line_chk CHECK (line_total_rupiah = unit_price_rupiah * quantity)
);

CREATE UNIQUE INDEX order_items_order_ticket_type_key ON order_items (order_id, ticket_type_id) WHERE event_seat_id IS NULL;
CREATE UNIQUE INDEX order_items_order_seat_key ON order_items (order_id, event_seat_id) WHERE event_seat_id IS NOT NULL;
CREATE INDEX order_items_ticket_type_idx ON order_items (ticket_type_id, order_id);

CREATE TABLE inventory_reservations (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  ticket_type_id TEXT NOT NULL REFERENCES event_ticket_types(id) ON DELETE RESTRICT,
  event_seat_id TEXT NULL REFERENCES event_seats(id) ON DELETE RESTRICT,
  quantity SMALLINT NOT NULL CHECK (quantity BETWEEN 1 AND 5),
  expires_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ NULL,
  release_reason VARCHAR(30) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inventory_reservations_order_item_key UNIQUE (order_item_id),
  CONSTRAINT inventory_reservations_release_chk CHECK (
    (released_at IS NULL AND release_reason IS NULL)
    OR (released_at IS NOT NULL AND release_reason IN ('EXPIRED', 'CANCELLED', 'CONVERTED_TO_PAID'))
  )
);

CREATE UNIQUE INDEX inventory_reservations_active_seat_key ON inventory_reservations (event_seat_id)
  WHERE event_seat_id IS NOT NULL AND released_at IS NULL;
CREATE INDEX inventory_reservations_order_active_idx ON inventory_reservations (order_id) WHERE released_at IS NULL;
CREATE INDEX inventory_reservations_type_active_idx ON inventory_reservations (ticket_type_id, expires_at) WHERE released_at IS NULL;

CREATE TABLE idempotency_keys (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  scope VARCHAR(60) NOT NULL CHECK (scope = 'CREATE_ORDER'),
  key_hash CHAR(64) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  status idempotency_status NOT NULL DEFAULT 'PROCESSING',
  resource_type VARCHAR(40) NULL,
  resource_id TEXT NULL,
  http_status SMALLINT NULL,
  response_body JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT idempotency_actor_scope_key UNIQUE (actor_user_id, scope, key_hash),
  CONSTRAINT idempotency_expiry_chk CHECK (expires_at = created_at + INTERVAL '24 hours'),
  CONSTRAINT idempotency_status_chk CHECK (
    (status = 'PROCESSING' AND resource_type IS NULL AND resource_id IS NULL AND http_status IS NULL AND response_body IS NULL)
    OR (status = 'COMPLETED' AND resource_type IS NOT NULL AND resource_id IS NOT NULL AND http_status BETWEEN 200 AND 599 AND response_body IS NOT NULL)
  )
);

CREATE INDEX idempotency_keys_cleanup_idx ON idempotency_keys (expires_at);

CREATE TABLE loyalty_accounts (
  id TEXT PRIMARY KEY,
  buyer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  organizer_profile_id TEXT NOT NULL REFERENCES organizer_profiles(id) ON DELETE RESTRICT,
  balance_points BIGINT NOT NULL DEFAULT 0 CHECK (balance_points >= 0),
  debt_points BIGINT NOT NULL DEFAULT 0 CHECK (debt_points >= 0),
  reserved_points BIGINT NOT NULL DEFAULT 0 CHECK (reserved_points >= 0 AND reserved_points <= balance_points),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT loyalty_accounts_buyer_organizer_key UNIQUE (buyer_user_id, organizer_profile_id)
);

CREATE INDEX loyalty_accounts_organizer_buyer_idx ON loyalty_accounts (organizer_profile_id, buyer_user_id);

ALTER TABLE orders
  ADD CONSTRAINT orders_loyalty_account_fk FOREIGN KEY (loyalty_account_id) REFERENCES loyalty_accounts(id) ON DELETE RESTRICT;

CREATE TABLE loyalty_ledger_entries (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES loyalty_accounts(id) ON DELETE RESTRICT,
  entry_type loyalty_entry_type NOT NULL,
  points_delta BIGINT NOT NULL,
  source_key VARCHAR(191) NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  refund_id TEXT NULL,
  balance_points_after BIGINT NOT NULL CHECK (balance_points_after >= 0),
  debt_points_after BIGINT NOT NULL CHECK (debt_points_after >= 0),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('SYSTEM', 'ADMIN')),
  correlation_id VARCHAR(80) NOT NULL,
  CONSTRAINT loyalty_ledger_account_source_type_key UNIQUE (account_id, source_key, entry_type),
  CONSTRAINT loyalty_ledger_delta_chk CHECK (
    (entry_type IN ('EARN', 'REDEEM_RESTORE') AND points_delta > 0)
    OR (entry_type IN ('REDEEM_DEBIT', 'EARN_REVERSAL') AND points_delta < 0)
  ),
  CONSTRAINT loyalty_ledger_refund_chk CHECK (
    (entry_type IN ('EARN', 'REDEEM_DEBIT') AND refund_id IS NULL)
    OR (entry_type IN ('EARN_REVERSAL', 'REDEEM_RESTORE'))
  )
);

CREATE INDEX loyalty_ledger_account_time_idx ON loyalty_ledger_entries (account_id, occurred_at DESC, id DESC);
CREATE INDEX loyalty_ledger_order_idx ON loyalty_ledger_entries (order_id, entry_type);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION loyalty_ledger_entries_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'LOYALTY_LEDGER_APPEND_ONLY';
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

CREATE TRIGGER loyalty_ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON loyalty_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION loyalty_ledger_entries_append_only();

CREATE TABLE loyalty_point_reservations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES loyalty_accounts(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  points BIGINT NOT NULL CHECK (points BETWEEN 1 AND 180000000000),
  discount_rupiah BIGINT NOT NULL,
  status loyalty_reservation_status NOT NULL DEFAULT 'ACTIVE',
  release_reason loyalty_release_reason NULL,
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consumed_at TIMESTAMPTZ NULL,
  released_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT loyalty_point_reservations_order_key UNIQUE (order_id),
  CONSTRAINT loyalty_reservations_discount_chk CHECK (discount_rupiah = points * 10),
  CONSTRAINT loyalty_reservations_state_chk CHECK (
    (status = 'ACTIVE' AND consumed_at IS NULL AND released_at IS NULL AND release_reason IS NULL)
    OR (status = 'CONSUMED' AND consumed_at IS NOT NULL AND released_at IS NULL AND release_reason IS NULL)
    OR (status = 'RELEASED' AND released_at IS NOT NULL AND release_reason IS NOT NULL AND consumed_at IS NULL)
  )
);

CREATE INDEX loyalty_reservations_account_active_idx ON loyalty_point_reservations (account_id, order_id) WHERE status = 'ACTIVE';
CREATE INDEX loyalty_reservations_order_status_idx ON loyalty_point_reservations (order_id, status);

-- +goose Down
DROP TABLE IF EXISTS loyalty_point_reservations;
DROP TRIGGER IF EXISTS loyalty_ledger_entries_append_only ON loyalty_ledger_entries;
DROP FUNCTION IF EXISTS loyalty_ledger_entries_append_only();
DROP TABLE IF EXISTS loyalty_ledger_entries;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_loyalty_account_fk;
DROP TABLE IF EXISTS loyalty_accounts;
DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS inventory_reservations;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TYPE IF EXISTS loyalty_release_reason;
DROP TYPE IF EXISTS loyalty_reservation_status;
DROP TYPE IF EXISTS loyalty_entry_type;
DROP TYPE IF EXISTS idempotency_status;
DROP TYPE IF EXISTS order_status;
ALTER TABLE event_ticket_types DROP CONSTRAINT IF EXISTS ticket_types_inventory_quota_chk;
ALTER TABLE event_ticket_types DROP CONSTRAINT IF EXISTS ticket_types_inventory_nonnegative_chk;
DROP INDEX IF EXISTS event_ticket_types_availability_idx;
ALTER TABLE event_ticket_types DROP COLUMN IF EXISTS paid_quantity;
ALTER TABLE event_ticket_types DROP COLUMN IF EXISTS reserved_quantity;
