-- +goose Up
CREATE TABLE IF NOT EXISTS gallery_files (
  name TEXT PRIMARY KEY,
  mime_type VARCHAR(64) NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
  bytes BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- +goose Down
DROP TABLE IF EXISTS gallery_files;
