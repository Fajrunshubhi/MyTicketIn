-- +goose Up
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS bank_name VARCHAR(40);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS bank_account_name VARCHAR(80);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(20);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS transfer_due_at TIMESTAMPTZ;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMPTZ;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS transfer_proof_name VARCHAR(80);

-- +goose Down
ALTER TABLE refunds DROP COLUMN IF EXISTS transfer_proof_name;
ALTER TABLE refunds DROP COLUMN IF EXISTS transferred_at;
ALTER TABLE refunds DROP COLUMN IF EXISTS transfer_due_at;
ALTER TABLE refunds DROP COLUMN IF EXISTS bank_account_number;
ALTER TABLE refunds DROP COLUMN IF EXISTS bank_account_name;
ALTER TABLE refunds DROP COLUMN IF EXISTS bank_name;
