-- +goose Up
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  username VARCHAR(40) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash TEXT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'USER',
  google_id VARCHAR(255) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT users_username_lower_chk CHECK (username = lower(username)),
  CONSTRAINT users_email_lower_chk CHECK (email = lower(email)),
  CONSTRAINT users_role_chk CHECK (role IN ('USER', 'ADMIN'))
);

CREATE UNIQUE INDEX users_username_key ON users (username);
CREATE UNIQUE INDEX users_email_key ON users (email);
CREATE UNIQUE INDEX users_google_id_key ON users (google_id) WHERE google_id IS NOT NULL;

-- +goose Down
DROP TABLE IF EXISTS users;
