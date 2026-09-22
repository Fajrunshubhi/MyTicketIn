-- +goose Up
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(9,6) NULL,
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,6) NULL,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_geo_chk;
ALTER TABLE events
  ADD CONSTRAINT events_geo_chk CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (
      latitude IS NOT NULL AND longitude IS NOT NULL
      AND latitude BETWEEN -90 AND 90
      AND longitude BETWEEN -180 AND 180
    )
  );

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_tags_card_chk;
ALTER TABLE events
  ADD CONSTRAINT events_tags_card_chk CHECK (cardinality(tags) <= 8);

CREATE TABLE IF NOT EXISTS event_tags (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tag VARCHAR(32) NOT NULL,
  PRIMARY KEY (event_id, tag),
  CONSTRAINT event_tags_format_chk CHECK (
    char_length(tag) BETWEEN 2 AND 32
    AND tag ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  )
);

CREATE INDEX IF NOT EXISTS event_tags_tag_idx ON event_tags (tag);
CREATE INDEX IF NOT EXISTS events_tags_gin_idx ON events USING GIN (tags);

-- +goose Down
DROP INDEX IF EXISTS events_tags_gin_idx;
DROP TABLE IF EXISTS event_tags;
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_tags_card_chk;
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_geo_chk;
ALTER TABLE events DROP COLUMN IF EXISTS tags;
ALTER TABLE events DROP COLUMN IF EXISTS longitude;
ALTER TABLE events DROP COLUMN IF EXISTS latitude;
