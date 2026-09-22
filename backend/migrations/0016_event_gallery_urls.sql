-- +goose Up
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS gallery_urls TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_gallery_card_chk;
ALTER TABLE events
  ADD CONSTRAINT events_gallery_card_chk CHECK (cardinality(gallery_urls) <= 8);

-- +goose Down
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_gallery_card_chk;
ALTER TABLE events DROP COLUMN IF EXISTS gallery_urls;
