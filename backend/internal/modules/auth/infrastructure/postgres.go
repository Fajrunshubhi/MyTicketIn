package infrastructure

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"myticketin/internal/modules/auth/domain"
	notifydomain "myticketin/internal/modules/notifications/domain"
	platdb "myticketin/internal/platform/db"
)

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *platdb.Pool) *Store {
	return &Store{pool: pool.Raw()}
}

func (s *Store) CreateLocal(ctx context.Context, id, name, username, email, passwordHash string) (domain.User, error) {
	row := s.row(ctx, `
		INSERT INTO users (id, name, username, email, password_hash, role)
		VALUES ($1, $2, $3, $4, $5, 'USER')
		RETURNING id, name, username, email, password_hash, role::text, status::text, auth_version, created_at`,
		id, name, username, email, passwordHash)
	u, err := scanUser(row)
	return u, mapConstraint(err)
}

func (s *Store) CreateOAuth(ctx context.Context, id, name, username, email string) (domain.User, error) {
	row := s.row(ctx, `
		INSERT INTO users (id, name, username, email, role)
		VALUES ($1, $2, $3, $4, 'USER')
		RETURNING id, name, username, email, password_hash, role::text, status::text, auth_version, created_at`,
		id, name, username, email)
	u, err := scanUser(row)
	return u, mapConstraint(err)
}

func (s *Store) GetByID(ctx context.Context, id string) (domain.User, error) {
	row := s.pool.QueryRow(ctx, userSelect+" WHERE id = $1", id)
	u, err := scanUser(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, domain.ErrRequired
	}
	return u, err
}

func (s *Store) SearchActiveStaff(ctx context.Context, q string, limit int) ([]domain.User, error) {
	pattern := "%" + strings.ToLower(strings.TrimSpace(q)) + "%"
	rows, err := s.pool.Query(ctx, userSelect+`
		WHERE status = 'ACTIVE' AND role = 'USER'
		  AND (lower(name) LIKE $1 OR username LIKE $1 OR email LIKE $1)
		ORDER BY name ASC, id ASC LIMIT $2`, pattern, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (s *Store) GetByUsernameOrEmail(ctx context.Context, identifier string) (domain.User, error) {
	row := s.pool.QueryRow(ctx, userSelect+" WHERE username = $1 OR email = $1 LIMIT 1", identifier)
	u, err := scanUser(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, domain.ErrInvalidCredentials
	}
	return u, err
}

func (s *Store) GetByProvider(ctx context.Context, provider, providerAccountID string) (domain.User, error) {
	row := s.row(ctx, `
		SELECT u.id, u.name, u.username, u.email, u.password_hash, u.role::text, u.status::text, u.auth_version, u.created_at
		FROM auth_accounts a JOIN users u ON u.id = a.user_id
		WHERE a.provider = $1 AND a.provider_account_id = $2`, provider, providerAccountID)
	u, err := scanUser(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, domain.ErrRequired
	}
	return u, err
}

func (s *Store) LinkAccount(ctx context.Context, accountID, userID, provider, providerAccountID string) error {
	_, err := s.exec(ctx, `
		INSERT INTO auth_accounts (id, user_id, type, provider, provider_account_id)
		VALUES ($1, $2, 'oauth', $3, $4)`, accountID, userID, provider, providerAccountID)
	return mapConstraint(err)
}

func (s *Store) UpdatePassword(ctx context.Context, userID, passwordHash string) error {
	_, err := s.exec(ctx, `UPDATE users SET password_hash=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, userID, passwordHash)
	return err
}

func (s *Store) UpdateProfile(ctx context.Context, userID, name, email string) (domain.User, error) {
	row := s.row(ctx, `
		UPDATE users SET name=$2, email=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$1
		RETURNING id, name, username, email, password_hash, role::text, status::text, auth_version, created_at`,
		userID, name, email)
	u, err := scanUser(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, domain.ErrRequired
	}
	return u, mapConstraint(err)
}

func (s *Store) RevokeActiveTokens(ctx context.Context, userID string, now time.Time) error {
	_, err := s.exec(ctx, `UPDATE password_reset_tokens SET revoked_at=$2 WHERE user_id=$1 AND used_at IS NULL AND revoked_at IS NULL`, userID, now)
	return err
}

func (s *Store) InsertToken(ctx context.Context, id, userID, tokenHash, ipHash string, adminID *string, expires time.Time) error {
	_, err := s.exec(ctx, `INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at,requested_ip_hash,created_by_admin_user_id)
		VALUES ($1,$2,$3,$4,$5,$6)`, id, userID, tokenHash, expires, ipHash, adminID)
	return err
}

func (s *Store) GetTokenForUpdate(ctx context.Context, tokenHash string) (domain.PasswordResetToken, error) {
	var t domain.PasswordResetToken
	err := s.row(ctx, `SELECT id,user_id,expires_at,used_at,revoked_at FROM password_reset_tokens WHERE token_hash=$1 FOR UPDATE`, tokenHash).
		Scan(&t.ID, &t.UserID, &t.ExpiresAt, &t.UsedAt, &t.RevokedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.PasswordResetToken{}, notifydomain.ErrResetTokenInvalid
	}
	return t, err
}

func (s *Store) MarkTokenUsed(ctx context.Context, id string, now time.Time) error {
	_, err := s.exec(ctx, `UPDATE password_reset_tokens SET used_at=$2 WHERE id=$1`, id, now)
	return err
}

func (s *Store) IncrementAuthVersion(ctx context.Context, userID string) (int, error) {
	var v int
	err := s.row(ctx, `
		UPDATE users SET auth_version = auth_version + 1, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 RETURNING auth_version`, userID).Scan(&v)
	return v, err
}

func (s *Store) TouchLastLogin(ctx context.Context, userID string) error {
	_, err := s.exec(ctx, `UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, userID)
	return err
}

func (s *Store) Create(ctx context.Context, sess domain.Session) error {
	_, err := s.exec(ctx, `
		INSERT INTO auth_sessions (id, user_id, token_hash, csrf_hash, auth_version, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6)`,
		sess.ID, sess.UserID, sess.TokenHash, sess.CSRFHash, sess.AuthVersion, sess.ExpiresAt)
	return err
}

func (s *Store) GetByTokenHash(ctx context.Context, tokenHash string) (domain.Session, domain.User, error) {
	row := s.row(ctx, `
		SELECT s.id, s.user_id, s.token_hash, s.csrf_hash, s.auth_version, s.expires_at,
		       u.id, u.name, u.username, u.email, u.password_hash, u.role::text, u.status::text, u.auth_version, u.created_at
		FROM auth_sessions s JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = $1`, tokenHash)
	var sess domain.Session
	var u domain.User
	var hash *string
	err := row.Scan(&sess.ID, &sess.UserID, &sess.TokenHash, &sess.CSRFHash, &sess.AuthVersion, &sess.ExpiresAt,
		&u.ID, &u.Name, &u.Username, &u.Email, &hash, &u.Role, &u.Status, &u.AuthVersion, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Session{}, domain.User{}, domain.ErrRequired
	}
	u.PasswordHash = hash
	return sess, u, err
}

func (s *Store) DeleteByTokenHash(ctx context.Context, tokenHash string) error {
	_, err := s.exec(ctx, `DELETE FROM auth_sessions WHERE token_hash = $1`, tokenHash)
	return err
}

func (s *Store) DeleteByUser(ctx context.Context, userID string) error {
	_, err := s.exec(ctx, `DELETE FROM auth_sessions WHERE user_id = $1`, userID)
	return err
}

func (s *Store) Hit(ctx context.Context, keyHash, scope string, window time.Duration) (int, error) {
	if window <= 0 {
		window = time.Hour
	}
	secs := int64(window / time.Second)
	var count int
	err := s.row(ctx, `
		INSERT INTO auth_rate_limits (key_hash, scope, window_started_at, attempt_count, updated_at)
		VALUES ($1, $2, NOW(), 1, NOW())
		ON CONFLICT (key_hash) DO UPDATE SET
		  attempt_count = CASE
		    WHEN auth_rate_limits.window_started_at > NOW() - ($3 * INTERVAL '1 second') THEN auth_rate_limits.attempt_count + 1
		    ELSE 1
		  END,
		  window_started_at = CASE
		    WHEN auth_rate_limits.window_started_at > NOW() - ($3 * INTERVAL '1 second') THEN auth_rate_limits.window_started_at
		    ELSE NOW()
		  END,
		  scope = EXCLUDED.scope,
		  updated_at = NOW()
		RETURNING attempt_count`, keyHash, scope, secs).Scan(&count)
	return count, err
}

const userSelect = `SELECT id, name, username, email, password_hash, role::text, status::text, auth_version, created_at FROM users`

type scanner interface {
	Scan(dest ...any) error
}

func scanUser(row scanner) (domain.User, error) {
	var u domain.User
	var hash *string
	err := row.Scan(&u.ID, &u.Name, &u.Username, &u.Email, &hash, &u.Role, &u.Status, &u.AuthVersion, &u.CreatedAt)
	u.PasswordHash = hash
	return u, err
}

func (s *Store) row(ctx context.Context, sql string, args ...any) pgx.Row {
	if tx := platdb.TxFrom(ctx); tx != nil {
		return tx.QueryRow(ctx, sql, args...)
	}
	return s.pool.QueryRow(ctx, sql, args...)
}

func (s *Store) exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	if tx := platdb.TxFrom(ctx); tx != nil {
		return tx.Exec(ctx, sql, args...)
	}
	return s.pool.Exec(ctx, sql, args...)
}

func mapConstraint(err error) error {
	if err == nil {
		return nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		if strings.Contains(pgErr.ConstraintName, "username") {
			return domain.ErrUsernameExists
		}
		if strings.Contains(pgErr.ConstraintName, "email") {
			return domain.ErrEmailExists
		}
	}
	return err
}
