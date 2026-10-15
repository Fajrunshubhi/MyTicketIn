-- +goose Up
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(16);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_chk;
ALTER TABLE users ADD CONSTRAINT users_phone_chk CHECK (phone IS NULL OR char_length(btrim(phone)) BETWEEN 10 AND 20);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_city_chk;
ALTER TABLE users ADD CONSTRAINT users_city_chk CHECK (city IS NULL OR char_length(btrim(city)) BETWEEN 2 AND 80);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_gender_chk;
ALTER TABLE users ADD CONSTRAINT users_gender_chk CHECK (gender IS NULL OR gender IN ('FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED'));

UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS email_otp_challenges (
  id TEXT PRIMARY KEY,
  purpose VARCHAR(24) NOT NULL,
  email VARCHAR(254) NOT NULL,
  user_id TEXT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash CHAR(64) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT email_otp_purpose_chk CHECK (purpose IN ('REGISTER', 'LOGIN')),
  CONSTRAINT email_otp_attempts_chk CHECK (attempt_count >= 0 AND attempt_count <= 20)
);
CREATE INDEX IF NOT EXISTS email_otp_email_created_idx ON email_otp_challenges (email, created_at DESC);
CREATE INDEX IF NOT EXISTS email_otp_open_idx ON email_otp_challenges (email, purpose) WHERE consumed_at IS NULL;

-- +goose Down
DROP TABLE IF EXISTS email_otp_challenges;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_gender_chk;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_city_chk;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_chk;
ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at;
ALTER TABLE users DROP COLUMN IF EXISTS gender;
ALTER TABLE users DROP COLUMN IF EXISTS city;
ALTER TABLE users DROP COLUMN IF EXISTS date_of_birth;
ALTER TABLE users DROP COLUMN IF EXISTS phone;
