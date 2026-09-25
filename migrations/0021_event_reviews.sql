-- +goose Up
CREATE TABLE IF NOT EXISTS event_reviews (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT event_reviews_comment_len_chk CHECK (char_length(btrim(comment)) BETWEEN 10 AND 500),
  CONSTRAINT event_reviews_user_event_key UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_reviews_event_created_idx ON event_reviews (event_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS event_reviews_created_idx ON event_reviews (created_at DESC, id DESC);

-- +goose Down
DROP INDEX IF EXISTS event_reviews_created_idx;
DROP INDEX IF EXISTS event_reviews_event_created_idx;
DROP TABLE IF EXISTS event_reviews;
