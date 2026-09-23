-- +goose Up
-- Pembelian dibatasi sisa kuota (bukan 1–5 per akun). Setiap unit tiket punya biodata pemegang.
-- Gambar carousel dinormalisasi ke event_gallery_images.

ALTER TABLE event_ticket_types DROP CONSTRAINT IF EXISTS event_ticket_types_max_per_account_check;
ALTER TABLE event_ticket_types DROP CONSTRAINT IF EXISTS event_ticket_types_max_per_account_chk;

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_quantity_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_quantity_chk CHECK (quantity >= 1 AND quantity <= 10000);

ALTER TABLE inventory_reservations DROP CONSTRAINT IF EXISTS inventory_reservations_quantity_check;
ALTER TABLE inventory_reservations ADD CONSTRAINT inventory_reservations_quantity_chk CHECK (quantity >= 1 AND quantity <= 10000);

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_unit_chk;
ALTER TABLE tickets ADD CONSTRAINT tickets_unit_chk CHECK (
  unit_sequence BETWEEN 1 AND 10000
  AND token_key_version > 0
  AND version > 0
  AND octet_length(token_nonce) = 12
  AND octet_length(token_auth_tag) = 16
);

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS holder_full_name VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS holder_email VARCHAR(254) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS holder_phone VARCHAR(20) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS holder_identity_number CHAR(16) NOT NULL DEFAULT '0000000000000000';

CREATE TABLE order_attendees (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  unit_sequence SMALLINT NOT NULL CHECK (unit_sequence BETWEEN 1 AND 10000),
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  identity_number CHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT order_attendees_item_unit_key UNIQUE (order_item_id, unit_sequence),
  CONSTRAINT order_attendees_order_identity_key UNIQUE (order_id, identity_number),
  CONSTRAINT order_attendees_identity_chk CHECK (identity_number ~ '^[0-9]{16}$'),
  CONSTRAINT order_attendees_email_chk CHECK (char_length(email) >= 3 AND email = lower(email)),
  CONSTRAINT order_attendees_name_chk CHECK (char_length(full_name) BETWEEN 2 AND 120)
);

CREATE INDEX order_attendees_event_identity_idx ON order_attendees (event_id, identity_number);
CREATE INDEX order_attendees_order_idx ON order_attendees (order_id, order_item_id, unit_sequence);

CREATE UNIQUE INDEX tickets_event_holder_identity_key
  ON tickets (event_id, holder_identity_number)
  WHERE status <> 'CANCELLED' AND holder_identity_number <> '0000000000000000';

CREATE TABLE event_gallery_images (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  image_url VARCHAR(500) NOT NULL,
  sort_order SMALLINT NOT NULL CHECK (sort_order BETWEEN 0 AND 7),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT event_gallery_images_event_sort_key UNIQUE (event_id, sort_order),
  CONSTRAINT event_gallery_images_event_url_key UNIQUE (event_id, image_url)
);

INSERT INTO event_gallery_images (id, event_id, image_url, sort_order)
SELECT e.id || ':g:' || (ord.ord - 1)::text, e.id, ord.url, (ord.ord - 1)::smallint
FROM events e
CROSS JOIN LATERAL unnest(COALESCE(e.gallery_urls, '{}'::text[])) WITH ORDINALITY AS ord(url, ord)
ON CONFLICT DO NOTHING;

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_gallery_card_chk;
ALTER TABLE events DROP COLUMN IF EXISTS gallery_urls;

-- +goose Down
ALTER TABLE events ADD COLUMN IF NOT EXISTS gallery_urls TEXT[] NOT NULL DEFAULT '{}';
UPDATE events e SET gallery_urls = COALESCE((
  SELECT array_agg(g.image_url ORDER BY g.sort_order)
  FROM event_gallery_images g WHERE g.event_id = e.id
), '{}'::text[]);
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_gallery_card_chk;
ALTER TABLE events ADD CONSTRAINT events_gallery_card_chk CHECK (cardinality(gallery_urls) <= 8);

DROP TABLE IF EXISTS event_gallery_images;
DROP INDEX IF EXISTS tickets_event_holder_identity_key;
DROP TABLE IF EXISTS order_attendees;

ALTER TABLE tickets
  DROP COLUMN IF EXISTS holder_full_name,
  DROP COLUMN IF EXISTS holder_email,
  DROP COLUMN IF EXISTS holder_phone,
  DROP COLUMN IF EXISTS holder_identity_number;

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_unit_chk;
ALTER TABLE tickets ADD CONSTRAINT tickets_unit_chk CHECK (
  unit_sequence BETWEEN 1 AND 5
  AND token_key_version > 0
  AND version > 0
  AND octet_length(token_nonce) = 12
  AND octet_length(token_auth_tag) = 16
);

ALTER TABLE inventory_reservations DROP CONSTRAINT IF EXISTS inventory_reservations_quantity_chk;
ALTER TABLE inventory_reservations ADD CONSTRAINT inventory_reservations_quantity_check CHECK (quantity BETWEEN 1 AND 5);

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_quantity_chk;
ALTER TABLE order_items ADD CONSTRAINT order_items_quantity_check CHECK (quantity BETWEEN 1 AND 5);
