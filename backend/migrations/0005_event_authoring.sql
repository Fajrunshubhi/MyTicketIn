-- +goose Up
CREATE TYPE event_status AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'CANCELLED', 'COMPLETED');
CREATE TYPE inventory_mode AS ENUM ('GENERAL_ADMISSION', 'ZONED', 'RESERVED_SEATING');
CREATE TYPE image_asset_status AS ENUM ('PENDING_UPLOAD', 'READY', 'FAILED', 'DELETED');

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  organizer_profile_id TEXT NOT NULL REFERENCES organizer_profiles(id) ON DELETE RESTRICT,
  slug VARCHAR(180) NOT NULL,
  title VARCHAR(160) NOT NULL,
  description VARCHAR(10000) NOT NULL,
  category VARCHAR(80) NOT NULL,
  venue_name VARCHAR(160) NOT NULL,
  address_line VARCHAR(500) NOT NULL,
  city VARCHAR(100) NOT NULL,
  province VARCHAR(100) NOT NULL,
  timezone VARCHAR(64) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  terms VARCHAR(5000) NOT NULL,
  contact_email VARCHAR(254) NOT NULL,
  contact_phone VARCHAR(32) NULL,
  status event_status NOT NULL DEFAULT 'DRAFT',
  inventory_mode inventory_mode NOT NULL DEFAULT 'GENERAL_ADMISSION',
  submitted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT events_slug_format_chk CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT events_time_chk CHECK (starts_at < ends_at),
  CONSTRAINT events_title_len_chk CHECK (char_length(btrim(title)) BETWEEN 3 AND 160),
  CONSTRAINT events_desc_len_chk CHECK (char_length(btrim(description)) BETWEEN 20 AND 10000),
  CONSTRAINT events_category_len_chk CHECK (char_length(btrim(category)) BETWEEN 2 AND 80),
  CONSTRAINT events_venue_len_chk CHECK (char_length(btrim(venue_name)) BETWEEN 2 AND 160),
  CONSTRAINT events_address_len_chk CHECK (char_length(btrim(address_line)) BETWEEN 2 AND 500),
  CONSTRAINT events_city_len_chk CHECK (char_length(btrim(city)) BETWEEN 2 AND 100),
  CONSTRAINT events_province_len_chk CHECK (char_length(btrim(province)) BETWEEN 2 AND 100),
  CONSTRAINT events_terms_len_chk CHECK (char_length(btrim(terms)) BETWEEN 2 AND 5000),
  CONSTRAINT events_email_chk CHECK (contact_email = lower(btrim(contact_email))),
  CONSTRAINT events_tz_chk CHECK (timezone IN ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura')),
  CONSTRAINT events_submission_chk CHECK (
    (status = 'DRAFT' AND submitted_at IS NULL)
    OR (status = 'PENDING_REVIEW' AND submitted_at IS NOT NULL)
    OR (status NOT IN ('DRAFT', 'PENDING_REVIEW'))
  )
);

CREATE UNIQUE INDEX events_slug_key ON events (slug);
CREATE INDEX events_organizer_updated_idx ON events (organizer_profile_id, updated_at DESC, id DESC);
CREATE INDEX events_status_starts_idx ON events (status, starts_at ASC, id ASC);

CREATE TABLE event_ticket_types (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(1000) NULL,
  price_rupiah BIGINT NOT NULL CHECK (price_rupiah BETWEEN 0 AND 1000000000),
  quota INTEGER NOT NULL CHECK (quota > 0),
  max_per_account INTEGER NOT NULL DEFAULT 5 CHECK (max_per_account BETWEEN 1 AND 5),
  sale_starts_at TIMESTAMPTZ NOT NULL,
  sale_ends_at TIMESTAMPTZ NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT event_ticket_types_sale_chk CHECK (sale_starts_at < sale_ends_at)
);

CREATE UNIQUE INDEX event_ticket_types_event_name_key ON event_ticket_types (event_id, lower(name));
CREATE INDEX event_ticket_types_event_order_idx ON event_ticket_types (event_id, sort_order ASC, id ASC);

CREATE TABLE venue_sections (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  ticket_type_id TEXT NOT NULL REFERENCES event_ticket_types(id) ON DELETE RESTRICT,
  name VARCHAR(120) NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0 CHECK (sort_order >= 0)
);

CREATE UNIQUE INDEX venue_sections_event_name_key ON venue_sections (event_id, lower(name));
CREATE INDEX venue_sections_event_order_idx ON venue_sections (event_id, sort_order ASC, id ASC);

CREATE TABLE event_seats (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  section_id TEXT NOT NULL REFERENCES venue_sections(id) ON DELETE RESTRICT,
  label VARCHAR(32) NOT NULL
);

CREATE UNIQUE INDEX event_seats_event_label_key ON event_seats (event_id, label);
CREATE INDEX event_seats_section_label_idx ON event_seats (section_id, label ASC, id ASC);

CREATE TABLE seat_map_assets (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  storage_key VARCHAR(512) NOT NULL,
  mime_type VARCHAR(64) NOT NULL,
  byte_size INTEGER NOT NULL,
  alt_text VARCHAR(300) NOT NULL,
  legend VARCHAR(2000) NOT NULL,
  status image_asset_status NOT NULL DEFAULT 'PENDING_UPLOAD',
  CONSTRAINT seat_map_assets_alt_chk CHECK (char_length(btrim(alt_text)) BETWEEN 3 AND 300),
  CONSTRAINT seat_map_assets_legend_chk CHECK (char_length(btrim(legend)) BETWEEN 3 AND 2000)
);

CREATE UNIQUE INDEX seat_map_assets_event_key ON seat_map_assets (event_id);

CREATE TABLE event_image_assets (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  storage_key VARCHAR(512) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(64) NOT NULL,
  byte_size INTEGER NOT NULL,
  width INTEGER NULL,
  height INTEGER NULL,
  alt_text VARCHAR(300) NOT NULL,
  status image_asset_status NOT NULL DEFAULT 'PENDING_UPLOAD',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT event_image_mime_chk CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT event_image_size_chk CHECK (byte_size BETWEEN 1 AND 5242880),
  CONSTRAINT event_image_dim_chk CHECK (
    (width IS NULL AND height IS NULL) OR (width BETWEEN 1 AND 8000 AND height BETWEEN 1 AND 8000)
  ),
  CONSTRAINT event_image_alt_chk CHECK (char_length(btrim(alt_text)) BETWEEN 3 AND 300),
  CONSTRAINT event_image_ready_dim_chk CHECK (status <> 'READY' OR (width IS NOT NULL AND height IS NOT NULL)),
  CONSTRAINT event_image_deleted_chk CHECK (
    (status = 'DELETED' AND deleted_at IS NOT NULL) OR (status <> 'DELETED' AND deleted_at IS NULL)
  )
);

CREATE UNIQUE INDEX event_image_assets_storage_key_key ON event_image_assets (storage_key);
CREATE UNIQUE INDEX event_image_assets_one_primary_key ON event_image_assets (event_id) WHERE is_primary AND status = 'READY';
CREATE INDEX event_image_assets_event_status_idx ON event_image_assets (event_id, status);

ALTER TABLE auth_rate_limits DROP CONSTRAINT IF EXISTS auth_rate_limits_scope_chk;
ALTER TABLE auth_rate_limits
  ADD CONSTRAINT auth_rate_limits_scope_chk
  CHECK (scope IN ('register', 'login', 'oauth', 'analytics', 'organizer', 'event', 'ai'));

-- +goose Down
ALTER TABLE auth_rate_limits DROP CONSTRAINT IF EXISTS auth_rate_limits_scope_chk;
ALTER TABLE auth_rate_limits
  ADD CONSTRAINT auth_rate_limits_scope_chk
  CHECK (scope IN ('register', 'login', 'oauth', 'analytics', 'organizer'));
DROP TABLE IF EXISTS event_image_assets;
DROP TABLE IF EXISTS seat_map_assets;
DROP TABLE IF EXISTS event_seats;
DROP TABLE IF EXISTS venue_sections;
DROP TABLE IF EXISTS event_ticket_types;
DROP TABLE IF EXISTS events;
DROP TYPE IF EXISTS image_asset_status;
DROP TYPE IF EXISTS inventory_mode;
DROP TYPE IF EXISTS event_status;
