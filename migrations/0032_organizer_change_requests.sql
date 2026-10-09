-- +goose Up
-- Changes to an approved organizer's verified data wait for admin approval; the live profile stays untouched until then.
CREATE TABLE organizer_change_requests (
  id TEXT PRIMARY KEY,
  organizer_profile_id TEXT NOT NULL REFERENCES organizer_profiles(id) ON DELETE RESTRICT,
  status VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  base_version INTEGER NOT NULL,
  name VARCHAR(120) NOT NULL,
  contact_email VARCHAR(254) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  description TEXT NOT NULL,
  organizer_type VARCHAR(20) NOT NULL CHECK (organizer_type IN ('INDIVIDUAL', 'ORGANIZATION')),
  pic_name VARCHAR(120) NOT NULL,
  city VARCHAR(80) NOT NULL,
  reference_url VARCHAR(300) NOT NULL,
  bank_name VARCHAR(40) NOT NULL,
  bank_account_name VARCHAR(80) NOT NULL,
  bank_account_number VARCHAR(20) NOT NULL,
  data_consent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMPTZ NULL,
  decided_by_user_id TEXT NULL REFERENCES users(id),
  decision_reason VARCHAR(1000) NULL
);

-- At most one open request per organizer.
CREATE UNIQUE INDEX organizer_change_requests_one_pending_idx
  ON organizer_change_requests (organizer_profile_id) WHERE status = 'PENDING';
CREATE INDEX organizer_change_requests_status_idx ON organizer_change_requests (status, submitted_at);

CREATE TABLE organizer_change_request_documents (
  id TEXT PRIMARY KEY,
  change_request_id TEXT NOT NULL REFERENCES organizer_change_requests(id) ON DELETE CASCADE,
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('KTP', 'SELFIE')),
  mime_type VARCHAR(40) NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
  nonce BYTEA NOT NULL,
  auth_tag BYTEA NOT NULL,
  ciphertext BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT organizer_change_request_documents_kind_key UNIQUE (change_request_id, kind)
);

ALTER TABLE organizer_profile_history DROP CONSTRAINT organizer_profile_history_type_chk;
ALTER TABLE organizer_profile_history
  ADD CONSTRAINT organizer_profile_history_type_chk CHECK (
    event_type IN (
      'SUBMITTED', 'EDITED', 'RESUBMITTED', 'APPROVED', 'REJECTED', 'SUSPENDED', 'RESTORED',
      'APPEALED', 'APPEAL_DISMISSED', 'REVOKED',
      'CHANGE_REQUESTED', 'CHANGE_APPROVED', 'CHANGE_REJECTED', 'CHANGE_CANCELLED'
    )
  );

-- +goose Down
ALTER TABLE organizer_profile_history DROP CONSTRAINT organizer_profile_history_type_chk;
ALTER TABLE organizer_profile_history
  ADD CONSTRAINT organizer_profile_history_type_chk CHECK (
    event_type IN (
      'SUBMITTED', 'EDITED', 'RESUBMITTED', 'APPROVED', 'REJECTED', 'SUSPENDED', 'RESTORED',
      'APPEALED', 'APPEAL_DISMISSED', 'REVOKED'
    )
  );
DROP TABLE IF EXISTS organizer_change_request_documents;
DROP TABLE IF EXISTS organizer_change_requests;
