-- +goose Up
-- F78: organizer promo codes per event. Money stays integer Rupiah; a redemption is one row per order.
CREATE TABLE promo_codes (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  organizer_profile_id TEXT NOT NULL REFERENCES organizer_profiles(id) ON DELETE RESTRICT,
  code VARCHAR(32) NOT NULL,
  discount_type VARCHAR(10) NOT NULL,
  discount_value BIGINT NOT NULL,
  max_discount_rupiah BIGINT NULL,
  min_subtotal_rupiah BIGINT NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  max_redemptions INTEGER NULL,
  redeemed_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT promo_codes_event_code_key UNIQUE (event_id, code),
  CONSTRAINT promo_codes_code_chk CHECK (code ~ '^[A-Z0-9_-]{3,32}$'),
  CONSTRAINT promo_codes_type_chk CHECK (discount_type IN ('PERCENT', 'FIXED')),
  -- At most 90%: a promo can never make an order free, so a payment always has an amount to charge.
  CONSTRAINT promo_codes_value_chk CHECK (
    (discount_type = 'PERCENT' AND discount_value BETWEEN 1 AND 90)
    OR (discount_type = 'FIXED' AND discount_value BETWEEN 1 AND 9000000000000 AND max_discount_rupiah IS NULL)
  ),
  CONSTRAINT promo_codes_cap_chk CHECK (max_discount_rupiah IS NULL OR max_discount_rupiah > 0),
  CONSTRAINT promo_codes_min_chk CHECK (min_subtotal_rupiah >= 0 AND min_subtotal_rupiah <= 9000000000000),
  CONSTRAINT promo_codes_window_chk CHECK (ends_at > starts_at),
  CONSTRAINT promo_codes_limit_chk CHECK (
    redeemed_count >= 0 AND (max_redemptions IS NULL OR (max_redemptions >= 1 AND redeemed_count <= max_redemptions))
  ),
  CONSTRAINT promo_codes_status_chk CHECK (status IN ('ACTIVE', 'DISABLED'))
);
CREATE INDEX promo_codes_event_idx ON promo_codes (event_id, created_at DESC);

CREATE TABLE promo_redemptions (
  id TEXT PRIMARY KEY,
  promo_code_id TEXT NOT NULL REFERENCES promo_codes(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  buyer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  discount_rupiah BIGINT NOT NULL CHECK (discount_rupiah > 0),
  status VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TIMESTAMPTZ NULL,
  release_reason VARCHAR(30) NULL,
  -- One redemption per order makes order creation retries harmless.
  CONSTRAINT promo_redemptions_order_key UNIQUE (order_id),
  CONSTRAINT promo_redemptions_state_chk CHECK (
    (status = 'ACTIVE' AND released_at IS NULL AND release_reason IS NULL)
    OR (status = 'RELEASED' AND released_at IS NOT NULL AND release_reason IS NOT NULL)
  )
);
-- One live use per buyer and code; a released (failed/expired) order frees the buyer to try again.
CREATE UNIQUE INDEX promo_redemptions_one_active_per_buyer_idx
  ON promo_redemptions (promo_code_id, buyer_user_id) WHERE status = 'ACTIVE';

ALTER TABLE orders
  ADD COLUMN promo_discount_rupiah BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN promo_code VARCHAR(32) NULL;

ALTER TABLE orders DROP CONSTRAINT orders_money_chk;
ALTER TABLE orders ADD CONSTRAINT orders_money_chk CHECK (
  subtotal_rupiah >= 0 AND loyalty_discount_rupiah >= 0 AND promo_discount_rupiah >= 0 AND total_payable_rupiah >= 0
  AND subtotal_rupiah <= 9000000000000
  AND promo_discount_rupiah * 10 <= subtotal_rupiah * 9
  AND total_payable_rupiah = subtotal_rupiah - promo_discount_rupiah - loyalty_discount_rupiah
  -- The 20% points cap applies to the subtotal that remains after the promo.
  AND loyalty_discount_rupiah <= ((subtotal_rupiah - promo_discount_rupiah) / 5)
  AND currency = 'IDR'
);
ALTER TABLE orders ADD CONSTRAINT orders_promo_snapshot_chk CHECK (
  (promo_discount_rupiah = 0 AND promo_code IS NULL) OR (promo_discount_rupiah > 0 AND promo_code IS NOT NULL)
);

-- +goose Down
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_promo_snapshot_chk;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_money_chk;
ALTER TABLE orders ADD CONSTRAINT orders_money_chk CHECK (
  subtotal_rupiah >= 0 AND loyalty_discount_rupiah >= 0 AND total_payable_rupiah >= 0
  AND subtotal_rupiah <= 9000000000000
  AND total_payable_rupiah = subtotal_rupiah - loyalty_discount_rupiah
  AND loyalty_discount_rupiah <= (subtotal_rupiah / 5)
  AND currency = 'IDR'
) NOT VALID;
ALTER TABLE orders DROP COLUMN IF EXISTS promo_code, DROP COLUMN IF EXISTS promo_discount_rupiah;
DROP TABLE IF EXISTS promo_redemptions;
DROP TABLE IF EXISTS promo_codes;
