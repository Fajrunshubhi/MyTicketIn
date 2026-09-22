-- +goose Up
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS moderation_reason VARCHAR(1000) NULL,
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS decided_by_user_id TEXT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id TEXT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(1000) NULL,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL;

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_decision_state_chk;
ALTER TABLE events ADD CONSTRAINT events_decision_state_chk CHECK (
  (
    status IN ('PUBLISHED', 'REJECTED')
    AND decided_at IS NOT NULL
    AND decided_by_user_id IS NOT NULL
    AND (
      status <> 'REJECTED'
      OR (moderation_reason IS NOT NULL AND char_length(btrim(moderation_reason)) BETWEEN 10 AND 1000)
    )
  )
  OR status NOT IN ('PUBLISHED', 'REJECTED')
);

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_publish_state_chk;
ALTER TABLE events ADD CONSTRAINT events_publish_state_chk CHECK (
  (status IN ('PUBLISHED', 'COMPLETED') AND published_at IS NOT NULL)
  OR (status NOT IN ('PUBLISHED', 'COMPLETED'))
);

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_cancel_state_chk;
ALTER TABLE events ADD CONSTRAINT events_cancel_state_chk CHECK (
  (
    status = 'CANCELLED'
    AND cancelled_at IS NOT NULL
    AND cancelled_by_user_id IS NOT NULL
    AND cancellation_reason IS NOT NULL
    AND char_length(btrim(cancellation_reason)) BETWEEN 10 AND 1000
  )
  OR (
    status <> 'CANCELLED'
    AND cancelled_at IS NULL
    AND cancelled_by_user_id IS NULL
    AND cancellation_reason IS NULL
  )
);

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_complete_state_chk;
ALTER TABLE events ADD CONSTRAINT events_complete_state_chk CHECK (
  (status = 'COMPLETED' AND completed_at IS NOT NULL)
  OR (status <> 'COMPLETED' AND completed_at IS NULL)
);

CREATE INDEX IF NOT EXISTS events_moderation_queue_idx ON events (status, submitted_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS events_publication_idx ON events (status, published_at DESC, id DESC);

ALTER TABLE event_ticket_types
  ADD COLUMN IF NOT EXISTS sales_stopped_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS sales_stopped_by_user_id TEXT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS sales_stop_reason VARCHAR(500) NULL;

ALTER TABLE event_ticket_types DROP CONSTRAINT IF EXISTS ticket_types_stop_state_chk;
ALTER TABLE event_ticket_types ADD CONSTRAINT ticket_types_stop_state_chk CHECK (
  (
    sales_stopped_at IS NULL
    AND sales_stopped_by_user_id IS NULL
    AND sales_stop_reason IS NULL
  )
  OR (
    sales_stopped_at IS NOT NULL
    AND sales_stopped_by_user_id IS NOT NULL
    AND sales_stop_reason IS NOT NULL
    AND char_length(btrim(sales_stop_reason)) BETWEEN 10 AND 500
  )
);

CREATE INDEX IF NOT EXISTS event_ticket_types_sale_window_idx
  ON event_ticket_types (event_id, sale_starts_at, sale_ends_at)
  WHERE sales_stopped_at IS NULL;

-- +goose StatementBegin
DO $$ BEGIN
  CREATE TYPE event_staff_assignment_status AS ENUM ('ACTIVE', 'REVOKED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
-- +goose StatementEnd

CREATE TABLE IF NOT EXISTS event_staff_assignments (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status event_staff_assignment_status NOT NULL DEFAULT 'ACTIVE',
  assigned_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_by_user_id TEXT NULL REFERENCES users(id) ON DELETE RESTRICT,
  revoked_at TIMESTAMPTZ NULL,
  revocation_reason VARCHAR(500) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT event_staff_assignments_event_user_key UNIQUE (event_id, user_id),
  CONSTRAINT event_staff_assignments_state_chk CHECK (
    (status = 'ACTIVE' AND revoked_by_user_id IS NULL AND revoked_at IS NULL AND revocation_reason IS NULL)
    OR (
      status = 'REVOKED'
      AND revoked_by_user_id IS NOT NULL
      AND revoked_at IS NOT NULL
      AND revocation_reason IS NOT NULL
      AND char_length(btrim(revocation_reason)) BETWEEN 10 AND 500
    )
  )
);

CREATE INDEX IF NOT EXISTS event_staff_assignments_user_active_idx
  ON event_staff_assignments (user_id, event_id)
  WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS event_staff_assignments_event_status_idx
  ON event_staff_assignments (event_id, status, assigned_at DESC, id DESC);

ALTER TABLE auth_rate_limits DROP CONSTRAINT IF EXISTS auth_rate_limits_scope_chk;
ALTER TABLE auth_rate_limits
  ADD CONSTRAINT auth_rate_limits_scope_chk
  CHECK (scope IN ('register', 'login', 'oauth', 'analytics', 'organizer', 'event', 'ai', 'staff'));

-- +goose Down
ALTER TABLE auth_rate_limits DROP CONSTRAINT IF EXISTS auth_rate_limits_scope_chk;
ALTER TABLE auth_rate_limits
  ADD CONSTRAINT auth_rate_limits_scope_chk
  CHECK (scope IN ('register', 'login', 'oauth', 'analytics', 'organizer', 'event', 'ai'));
DROP TABLE IF EXISTS event_staff_assignments;
DROP TYPE IF EXISTS event_staff_assignment_status;
DROP INDEX IF EXISTS event_ticket_types_sale_window_idx;
ALTER TABLE event_ticket_types DROP CONSTRAINT IF EXISTS ticket_types_stop_state_chk;
ALTER TABLE event_ticket_types
  DROP COLUMN IF EXISTS sales_stopped_at,
  DROP COLUMN IF EXISTS sales_stopped_by_user_id,
  DROP COLUMN IF EXISTS sales_stop_reason;
DROP INDEX IF EXISTS events_publication_idx;
DROP INDEX IF EXISTS events_moderation_queue_idx;
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_complete_state_chk;
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_cancel_state_chk;
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_publish_state_chk;
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_decision_state_chk;
ALTER TABLE events
  DROP COLUMN IF EXISTS moderation_reason,
  DROP COLUMN IF EXISTS decided_at,
  DROP COLUMN IF EXISTS decided_by_user_id,
  DROP COLUMN IF EXISTS published_at,
  DROP COLUMN IF EXISTS cancelled_at,
  DROP COLUMN IF EXISTS cancelled_by_user_id,
  DROP COLUMN IF EXISTS cancellation_reason,
  DROP COLUMN IF EXISTS completed_at;
