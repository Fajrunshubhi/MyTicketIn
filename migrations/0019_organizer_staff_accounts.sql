-- +goose Up
-- +goose StatementBegin
DO $$ BEGIN
  CREATE TYPE organizer_staff_status AS ENUM ('ACTIVE', 'DISABLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
-- +goose StatementEnd

CREATE TABLE IF NOT EXISTS organizer_staff_accounts (
  id TEXT PRIMARY KEY,
  organizer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  username VARCHAR(40) NOT NULL,
  status organizer_staff_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT organizer_staff_username_chk CHECK (
    username = lower(username)
    AND username ~ '^[a-z0-9._-]{3,40}$'
  ),
  CONSTRAINT organizer_staff_user_key UNIQUE (user_id),
  CONSTRAINT organizer_staff_org_username_key UNIQUE (organizer_user_id, username)
);

CREATE INDEX IF NOT EXISTS organizer_staff_org_idx
  ON organizer_staff_accounts (organizer_user_id, status, username);

CREATE INDEX IF NOT EXISTS organizer_staff_user_active_idx
  ON organizer_staff_accounts (user_id)
  WHERE status = 'ACTIVE';

-- +goose Down
DROP INDEX IF EXISTS organizer_staff_user_active_idx;
DROP INDEX IF EXISTS organizer_staff_org_idx;
DROP TABLE IF EXISTS organizer_staff_accounts;
DROP TYPE IF EXISTS organizer_staff_status;
