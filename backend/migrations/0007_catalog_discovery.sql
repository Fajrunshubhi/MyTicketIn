-- +goose Up
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS search_document tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(category, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(venue_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(city, '') || ' ' || coalesce(province, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS events_search_document_idx ON events USING GIN (search_document);
CREATE INDEX IF NOT EXISTS events_catalog_soonest_idx ON events (starts_at ASC, id ASC) WHERE status = 'PUBLISHED';
CREATE INDEX IF NOT EXISTS events_catalog_newest_idx ON events (published_at DESC, id DESC) WHERE status = 'PUBLISHED';
CREATE INDEX IF NOT EXISTS events_catalog_category_idx ON events (lower(category), starts_at, id) WHERE status = 'PUBLISHED';
CREATE INDEX IF NOT EXISTS events_catalog_city_idx ON events (lower(city), starts_at, id) WHERE status = 'PUBLISHED';
CREATE INDEX IF NOT EXISTS events_catalog_province_idx ON events (lower(province), starts_at, id) WHERE status = 'PUBLISHED';

-- +goose Down
DROP INDEX IF EXISTS events_catalog_province_idx;
DROP INDEX IF EXISTS events_catalog_city_idx;
DROP INDEX IF EXISTS events_catalog_category_idx;
DROP INDEX IF EXISTS events_catalog_newest_idx;
DROP INDEX IF EXISTS events_catalog_soonest_idx;
DROP INDEX IF EXISTS events_search_document_idx;
ALTER TABLE events DROP COLUMN IF EXISTS search_document;
