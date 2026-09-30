-- +goose Up
DROP INDEX IF EXISTS tickets_event_seat_paid_key;
CREATE UNIQUE INDEX tickets_event_seat_paid_key ON tickets (event_seat_id)
  WHERE event_seat_id IS NOT NULL AND status <> 'CANCELLED';

-- +goose Down
DROP INDEX IF EXISTS tickets_event_seat_paid_key;
CREATE UNIQUE INDEX tickets_event_seat_paid_key ON tickets (event_seat_id) WHERE event_seat_id IS NOT NULL;
