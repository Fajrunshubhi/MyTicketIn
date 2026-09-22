-- +goose Up
CREATE TYPE organizer_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

CREATE TABLE organizer_profiles (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name VARCHAR(120) NOT NULL,
  contact_email VARCHAR(254) NOT NULL,
  contact_phone VARCHAR(32) NULL,
  description VARCHAR(2000) NOT NULL,
  status organizer_status NOT NULL DEFAULT 'PENDING',
  decision_reason VARCHAR(1000) NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMPTZ NULL,
  decided_by_user_id TEXT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT organizer_profiles_owner_key UNIQUE (owner_user_id),
  CONSTRAINT organizer_profiles_name_len_chk CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  CONSTRAINT organizer_profiles_desc_len_chk CHECK (char_length(btrim(description)) BETWEEN 20 AND 2000),
  CONSTRAINT organizer_profiles_email_chk CHECK (contact_email = lower(btrim(contact_email))),
  CONSTRAINT organizer_profiles_decision_chk CHECK (
    (status = 'PENDING' AND decision_reason IS NULL AND decided_at IS NULL AND decided_by_user_id IS NULL)
    OR
    (status <> 'PENDING' AND decision_reason IS NOT NULL AND decided_at IS NOT NULL AND decided_by_user_id IS NOT NULL)
  )
);

CREATE INDEX organizer_profiles_queue_idx ON organizer_profiles (status, submitted_at ASC, id ASC);
CREATE INDEX organizer_profiles_name_idx ON organizer_profiles (name);

ALTER TABLE auth_rate_limits DROP CONSTRAINT IF EXISTS auth_rate_limits_scope_chk;
ALTER TABLE auth_rate_limits
  ADD CONSTRAINT auth_rate_limits_scope_chk
  CHECK (scope IN ('register', 'login', 'oauth', 'analytics', 'organizer'));

-- +goose Down
ALTER TABLE auth_rate_limits DROP CONSTRAINT IF EXISTS auth_rate_limits_scope_chk;
ALTER TABLE auth_rate_limits
  ADD CONSTRAINT auth_rate_limits_scope_chk
  CHECK (scope IN ('register', 'login', 'oauth', 'analytics'));
DROP TABLE IF EXISTS organizer_profiles;
DROP TYPE IF EXISTS organizer_status;
