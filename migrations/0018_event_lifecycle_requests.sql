-- +goose Up
CREATE TABLE event_lifecycle_requests (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  ticket_type_id TEXT NULL REFERENCES event_ticket_types(id) ON DELETE RESTRICT,
  kind VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  requested_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by_user_id TEXT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ NULL,
  decision_reason VARCHAR(1000) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT event_lifecycle_requests_kind_chk CHECK (kind IN ('CANCEL_EVENT', 'STOP_SALES')),
  CONSTRAINT event_lifecycle_requests_status_chk CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  CONSTRAINT event_lifecycle_requests_reason_chk CHECK (char_length(btrim(reason)) BETWEEN 10 AND 1000),
  CONSTRAINT event_lifecycle_requests_ticket_chk CHECK (
    (kind = 'CANCEL_EVENT' AND ticket_type_id IS NULL)
    OR (kind = 'STOP_SALES' AND ticket_type_id IS NOT NULL)
  ),
  CONSTRAINT event_lifecycle_requests_decision_chk CHECK (
    (status = 'PENDING' AND decided_by_user_id IS NULL AND decided_at IS NULL AND decision_reason IS NULL)
    OR (
      status IN ('APPROVED', 'REJECTED')
      AND decided_by_user_id IS NOT NULL
      AND decided_at IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX event_lifecycle_requests_pending_key
  ON event_lifecycle_requests (event_id, kind, COALESCE(ticket_type_id, ''))
  WHERE status = 'PENDING';

CREATE INDEX event_lifecycle_requests_pending_idx
  ON event_lifecycle_requests (status, requested_at ASC, id ASC)
  WHERE status = 'PENDING';

CREATE INDEX event_lifecycle_requests_event_idx
  ON event_lifecycle_requests (event_id, requested_at DESC, id DESC);

-- +goose Down
DROP INDEX IF EXISTS event_lifecycle_requests_event_idx;
DROP INDEX IF EXISTS event_lifecycle_requests_pending_idx;
DROP INDEX IF EXISTS event_lifecycle_requests_pending_key;
DROP TABLE IF EXISTS event_lifecycle_requests;
