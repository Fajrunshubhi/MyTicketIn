-- +goose Up
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'PAYMENT_INSTRUCTIONS';

-- +goose Down
SELECT 1;
