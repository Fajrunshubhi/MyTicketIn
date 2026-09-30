-- +goose Up
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'MODERATION_NEEDED';

-- +goose Down
SELECT 1;
