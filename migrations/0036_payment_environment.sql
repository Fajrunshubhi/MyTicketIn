-- +goose Up
-- Buyer payments may be SANDBOX (uji) or PRODUCTION (Midtrans Production). Amount stays integer IDR.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_sandbox_chk;
ALTER TABLE payments ADD CONSTRAINT payments_environment_chk CHECK (
  environment IN ('SANDBOX', 'PRODUCTION')
  AND amount_rupiah >= 0
  AND currency = 'IDR'
  AND version > 0
  AND jsonb_typeof(instruction_data) = 'object'
);

-- +goose Down
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_environment_chk;
ALTER TABLE payments ADD CONSTRAINT payments_sandbox_chk CHECK (
  environment = 'SANDBOX'
  AND amount_rupiah >= 0
  AND currency = 'IDR'
  AND version > 0
  AND jsonb_typeof(instruction_data) = 'object'
);
