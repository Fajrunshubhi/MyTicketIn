-- +goose Up
-- Allows the shared idempotency helper to also protect the organizer payout request.
ALTER TABLE idempotency_keys DROP CONSTRAINT IF EXISTS idempotency_keys_scope_chk;
ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_scope_chk
  CHECK (scope IN ('CREATE_ORDER','CREATE_PAYMENT','RESOLVE_RECONCILIATION','CREATE_REFUND','DECIDE_REFUND','REQUEST_PAYOUT'));

-- +goose Down
DELETE FROM idempotency_keys WHERE scope = 'REQUEST_PAYOUT';
ALTER TABLE idempotency_keys DROP CONSTRAINT IF EXISTS idempotency_keys_scope_chk;
ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_scope_chk
  CHECK (scope IN ('CREATE_ORDER','CREATE_PAYMENT','RESOLVE_RECONCILIATION','CREATE_REFUND','DECIDE_REFUND'));
