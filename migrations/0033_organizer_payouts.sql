-- +goose Up
-- Organizer payouts (sandbox): the platform account receives all buyer payments (Midtrans), then forwards the net
-- of each finished event to the organizer's registered bank account. Balance is derived from paid orders minus
-- completed refunds, so there is no mutable balance column that could drift.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'PAYOUT_UPDATED';

CREATE TABLE organizer_payouts (
  id TEXT PRIMARY KEY,
  payout_number VARCHAR(24) NOT NULL,
  organizer_profile_id TEXT NOT NULL REFERENCES organizer_profiles(id) ON DELETE RESTRICT,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  amount_rupiah BIGINT NOT NULL CHECK (amount_rupiah > 0),
  status VARCHAR(10) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'PAID', 'REJECTED')),
  -- Bank data is snapshotted so later profile changes cannot redirect an existing payout.
  bank_name VARCHAR(40) NOT NULL,
  bank_account_name VARCHAR(80) NOT NULL,
  bank_account_number VARCHAR(20) NOT NULL,
  requested_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by_user_id TEXT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ NULL,
  decision_reason VARCHAR(1000) NULL,
  transfer_proof_name VARCHAR(80) NULL,
  paid_at TIMESTAMPTZ NULL,
  CONSTRAINT organizer_payouts_number_key UNIQUE (payout_number),
  CONSTRAINT organizer_payouts_state_chk CHECK (
    (status = 'REQUESTED' AND decided_at IS NULL AND paid_at IS NULL)
    OR (status = 'PAID' AND decided_by_user_id IS NOT NULL AND paid_at IS NOT NULL AND transfer_proof_name IS NOT NULL)
    OR (status = 'REJECTED' AND decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL
        AND char_length(btrim(decision_reason)) >= 10)
  )
);

-- One live payout per event: a request or a payment blocks another request; a rejection frees the event again.
CREATE UNIQUE INDEX organizer_payouts_one_live_per_event_idx
  ON organizer_payouts (event_id) WHERE status IN ('REQUESTED', 'PAID');
CREATE INDEX organizer_payouts_organizer_idx ON organizer_payouts (organizer_profile_id, requested_at DESC);
CREATE INDEX organizer_payouts_status_idx ON organizer_payouts (status, requested_at);

-- +goose Down
DROP TABLE IF EXISTS organizer_payouts;
