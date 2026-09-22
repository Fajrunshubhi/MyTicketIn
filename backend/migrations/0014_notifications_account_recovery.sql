-- +goose Up
-- RFC-013 notifications and account recovery (goose 0014; RFC text said 0013, already used by reporting).

CREATE TYPE notification_type AS ENUM (
  'ORGANIZER_APPROVED', 'ORGANIZER_REJECTED', 'ORGANIZER_SUSPENDED',
  'EVENT_PUBLISHED', 'EVENT_REJECTED', 'EVENT_CANCELLED',
  'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'TICKET_ISSUED',
  'REFUND_UPDATED', 'EVENT_REMINDER', 'PASSWORD_RESET_ASSISTED'
);
CREATE TYPE notification_channel AS ENUM ('IN_APP', 'EMAIL');
CREATE TYPE notification_delivery_status AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED');
CREATE TYPE outbox_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type notification_type NOT NULL,
  title VARCHAR(160) NOT NULL,
  body VARCHAR(1000) NOT NULL,
  action_path VARCHAR(500) NULL,
  entity_type VARCHAR(60) NULL,
  entity_id TEXT NULL,
  deduplication_key VARCHAR(180) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT notifications_title_body_chk CHECK (char_length(btrim(title)) BETWEEN 1 AND 160 AND char_length(btrim(body)) BETWEEN 1 AND 1000),
  CONSTRAINT notifications_action_path_chk CHECK (
    action_path IS NULL OR (action_path LIKE '/%' AND action_path NOT LIKE '//%' AND position('://' in action_path) = 0)
  ),
  CONSTRAINT notifications_entity_pair_chk CHECK (
    (entity_type IS NULL AND entity_id IS NULL) OR (entity_type IS NOT NULL AND entity_id IS NOT NULL)
  ),
  CONSTRAINT notifications_expires_chk CHECK (expires_at IS NULL OR expires_at > created_at),
  CONSTRAINT notifications_metadata_chk CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE UNIQUE INDEX notifications_recipient_dedup_key ON notifications (recipient_user_id, deduplication_key);
CREATE INDEX notifications_recipient_created_idx ON notifications (recipient_user_id, created_at DESC, id DESC);
CREATE INDEX notifications_recipient_unread_idx ON notifications (recipient_user_id, created_at DESC, id DESC) WHERE read_at IS NULL;

CREATE TABLE notification_outbox (
  id TEXT PRIMARY KEY,
  domain_event_id VARCHAR(160) NOT NULL,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  notification_type notification_type NOT NULL,
  payload JSONB NOT NULL,
  status outbox_status NOT NULL DEFAULT 'PENDING',
  attempt_count SMALLINT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at TIMESTAMPTZ NULL,
  locked_by VARCHAR(100) NULL,
  last_error_code VARCHAR(80) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ NULL,
  CONSTRAINT notification_outbox_payload_chk CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 16384),
  CONSTRAINT notification_outbox_attempts_chk CHECK (attempt_count BETWEEN 0 AND 5),
  CONSTRAINT notification_outbox_status_chk CHECK (
    (status = 'PROCESSING' AND locked_at IS NOT NULL AND locked_by IS NOT NULL AND completed_at IS NULL)
    OR (status = 'COMPLETED' AND completed_at IS NOT NULL)
    OR (status IN ('PENDING', 'FAILED') AND completed_at IS NULL)
  )
);
CREATE UNIQUE INDEX notification_outbox_dedup_key ON notification_outbox (domain_event_id, recipient_user_id, notification_type);
CREATE INDEX notification_outbox_dispatch_idx ON notification_outbox (status, next_attempt_at, id);
CREATE INDEX notification_outbox_locked_idx ON notification_outbox (locked_at) WHERE status = 'PROCESSING';

CREATE TABLE notification_deliveries (
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE RESTRICT,
  channel notification_channel NOT NULL,
  status notification_delivery_status NOT NULL DEFAULT 'PENDING',
  provider VARCHAR(40) NULL,
  provider_message_id VARCHAR(255) NULL,
  template_key VARCHAR(80) NOT NULL,
  template_version SMALLINT NOT NULL DEFAULT 1,
  attempt_count SMALLINT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NULL,
  last_error_code VARCHAR(80) NULL,
  sent_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT notification_deliveries_version_chk CHECK (template_version > 0 AND attempt_count BETWEEN 0 AND 5),
  CONSTRAINT notification_deliveries_sent_chk CHECK (
    (status = 'SENT' AND sent_at IS NOT NULL) OR (status <> 'SENT' AND sent_at IS NULL)
  )
);
CREATE UNIQUE INDEX notification_deliveries_channel_key ON notification_deliveries (notification_id, channel);
CREATE UNIQUE INDEX notification_deliveries_provider_msg_key ON notification_deliveries (provider, provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX notification_deliveries_retry_idx ON notification_deliveries (status, next_attempt_at, id) WHERE status IN ('PENDING', 'FAILED');

CREATE TABLE password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash CHAR(64) NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  requested_ip_hash CHAR(64) NULL,
  created_by_admin_user_id TEXT NULL REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT password_reset_tokens_expiry_chk CHECK (expires_at > requested_at),
  CONSTRAINT password_reset_tokens_terminal_chk CHECK (
    (used_at IS NULL AND revoked_at IS NULL)
    OR (used_at IS NOT NULL AND revoked_at IS NULL)
    OR (used_at IS NULL AND revoked_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX password_reset_tokens_hash_key ON password_reset_tokens (token_hash);
CREATE UNIQUE INDEX password_reset_tokens_one_active_user_key ON password_reset_tokens (user_id) WHERE used_at IS NULL AND revoked_at IS NULL;
CREATE INDEX password_reset_tokens_expiry_idx ON password_reset_tokens (expires_at) WHERE used_at IS NULL AND revoked_at IS NULL;

ALTER TABLE auth_rate_limits DROP CONSTRAINT IF EXISTS auth_rate_limits_scope_chk;
ALTER TABLE auth_rate_limits
  ADD CONSTRAINT auth_rate_limits_scope_chk
  CHECK (scope IN (
    'register', 'login', 'oauth', 'analytics', 'organizer', 'event', 'ai', 'staff',
    'catalog', 'catalog-search', 'catalog-filters', 'catalog-detail', 'catalog-ai-min', 'catalog-ai-day',
    'checkout-summary', 'create-order', 'create-payment', 'webhook-payments', 'ticket-qr',
    'checkin-qr', 'checkin-manual', 'checkin-invalid',
    'report-dashboard', 'report-export', 'recommendation',
    'notify-inbox', 'password-reset-email', 'password-reset-ip'
  ));

-- +goose Down
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS notification_deliveries;
DROP TABLE IF EXISTS notification_outbox;
DROP TABLE IF EXISTS notifications;
DROP TYPE IF EXISTS outbox_status;
DROP TYPE IF EXISTS notification_delivery_status;
DROP TYPE IF EXISTS notification_channel;
DROP TYPE IF EXISTS notification_type;
ALTER TABLE auth_rate_limits DROP CONSTRAINT IF EXISTS auth_rate_limits_scope_chk;
ALTER TABLE auth_rate_limits
  ADD CONSTRAINT auth_rate_limits_scope_chk
  CHECK (scope IN (
    'register', 'login', 'oauth', 'analytics', 'organizer', 'event', 'ai', 'staff',
    'catalog', 'catalog-search', 'catalog-filters', 'catalog-detail', 'catalog-ai-min', 'catalog-ai-day',
    'checkout-summary', 'create-order', 'create-payment', 'webhook-payments', 'ticket-qr',
    'checkin-qr', 'checkin-manual', 'checkin-invalid',
    'report-dashboard', 'report-export', 'recommendation'
  ));
