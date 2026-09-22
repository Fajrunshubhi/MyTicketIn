-- name: GetAuthUserByID :one
SELECT id, name, username, email, password_hash, role::text, status::text, auth_version, created_at, last_login_at
FROM users
WHERE id = $1;

-- name: GetAuthUserByUsernameOrEmail :one
SELECT id, name, username, email, password_hash, role::text, status::text, auth_version, created_at, last_login_at
FROM users
WHERE username = $1 OR email = $1
LIMIT 1;

-- name: InsertLocalUser :one
INSERT INTO users (id, name, username, email, password_hash, role)
VALUES ($1, $2, $3, $4, $5, 'USER')
RETURNING id, name, username, email, role::text, status::text, auth_version, created_at;

-- name: InsertOAuthUser :one
INSERT INTO users (id, name, username, email, role)
VALUES ($1, $2, $3, $4, 'USER')
RETURNING id, name, username, email, role::text, status::text, auth_version, created_at;

-- name: InsertAuthAccount :exec
INSERT INTO auth_accounts (id, user_id, type, provider, provider_account_id)
VALUES ($1, $2, 'oauth', $3, $4);

-- name: GetUserByProviderAccount :one
SELECT u.id, u.name, u.username, u.email, u.password_hash, u.role::text, u.status::text, u.auth_version, u.created_at, u.last_login_at
FROM auth_accounts a
JOIN users u ON u.id = a.user_id
WHERE a.provider = $1 AND a.provider_account_id = $2;

-- name: IncrementAuthVersion :one
UPDATE users
SET auth_version = auth_version + 1, updated_at = CURRENT_TIMESTAMP
WHERE id = $1
RETURNING auth_version;

-- name: TouchLastLogin :exec
UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1;

-- name: InsertSession :exec
INSERT INTO auth_sessions (id, user_id, token_hash, csrf_hash, auth_version, expires_at)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: GetSessionByTokenHash :one
SELECT s.id, s.user_id, s.token_hash, s.csrf_hash, s.auth_version, s.expires_at, s.created_at,
       u.name, u.username, u.email, u.role::text, u.status::text, u.auth_version
FROM auth_sessions s
JOIN users u ON u.id = s.user_id
WHERE s.token_hash = $1;

-- name: DeleteSession :exec
DELETE FROM auth_sessions WHERE token_hash = $1;

-- name: DeleteUserSessions :exec
DELETE FROM auth_sessions WHERE user_id = $1;

-- name: UpsertRateLimit :one
INSERT INTO auth_rate_limits (key_hash, scope, window_started_at, attempt_count, blocked_until, updated_at)
VALUES ($1, $2, $3, 1, NULL, CURRENT_TIMESTAMP)
ON CONFLICT (key_hash) DO UPDATE SET
  attempt_count = CASE
    WHEN auth_rate_limits.window_started_at <= $3 THEN auth_rate_limits.attempt_count + 1
    ELSE 1
  END,
  window_started_at = CASE
    WHEN auth_rate_limits.window_started_at <= $3 THEN auth_rate_limits.window_started_at
    ELSE CURRENT_TIMESTAMP
  END,
  updated_at = CURRENT_TIMESTAMP
RETURNING attempt_count, window_started_at, blocked_until;
