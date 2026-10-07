-- +goose Up
-- Verification data for organizer applications. New columns stay nullable so applications
-- submitted before this migration remain valid; the application layer requires them for new submissions.
ALTER TABLE organizer_profiles ADD COLUMN IF NOT EXISTS organizer_type VARCHAR(20);
ALTER TABLE organizer_profiles ADD COLUMN IF NOT EXISTS pic_name VARCHAR(120);
ALTER TABLE organizer_profiles ADD COLUMN IF NOT EXISTS city VARCHAR(80);
ALTER TABLE organizer_profiles ADD COLUMN IF NOT EXISTS reference_url VARCHAR(300);
ALTER TABLE organizer_profiles ADD COLUMN IF NOT EXISTS data_consent_at TIMESTAMPTZ;
ALTER TABLE organizer_profiles
  ADD CONSTRAINT organizer_profiles_type_chk CHECK (organizer_type IS NULL OR organizer_type IN ('INDIVIDUAL', 'ORGANIZATION'));

-- Identity images are stored encrypted (AES-256-GCM) and are never served by a public URL.
CREATE TABLE organizer_verification_documents (
  id TEXT PRIMARY KEY,
  organizer_profile_id TEXT NOT NULL REFERENCES organizer_profiles(id) ON DELETE RESTRICT,
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('KTP', 'SELFIE')),
  mime_type VARCHAR(40) NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
  nonce BYTEA NOT NULL,
  auth_tag BYTEA NOT NULL,
  ciphertext BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT organizer_verification_documents_kind_key UNIQUE (organizer_profile_id, kind)
);

-- +goose Down
DROP TABLE IF EXISTS organizer_verification_documents;
ALTER TABLE organizer_profiles DROP CONSTRAINT IF EXISTS organizer_profiles_type_chk;
ALTER TABLE organizer_profiles DROP COLUMN IF EXISTS data_consent_at;
ALTER TABLE organizer_profiles DROP COLUMN IF EXISTS reference_url;
ALTER TABLE organizer_profiles DROP COLUMN IF EXISTS city;
ALTER TABLE organizer_profiles DROP COLUMN IF EXISTS pic_name;
ALTER TABLE organizer_profiles DROP COLUMN IF EXISTS organizer_type;
