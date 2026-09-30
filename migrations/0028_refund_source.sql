-- +goose Up
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS source VARCHAR(24) NOT NULL DEFAULT 'ADMIN';
ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_source_chk;
ALTER TABLE refunds ADD CONSTRAINT refunds_source_chk CHECK (source IN ('ADMIN', 'BUYER', 'EVENT_CANCELLED'));

-- +goose Down
ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_source_chk;
ALTER TABLE refunds DROP COLUMN IF EXISTS source;
