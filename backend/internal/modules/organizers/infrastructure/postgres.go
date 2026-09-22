package infrastructure

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"myticketin/internal/modules/organizers/domain"
	platdb "myticketin/internal/platform/db"
)

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *platdb.Pool) *Store {
	return &Store{pool: pool.Raw()}
}

func (s *Store) Create(ctx context.Context, p domain.Profile) error {
	_, err := exec(ctx, s, `
		INSERT INTO organizer_profiles (
		  id, owner_user_id, name, contact_email, contact_phone, description, status,
		  submitted_at, created_at, updated_at, version
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		p.ID, p.OwnerUserID, p.Name, p.ContactEmail, p.ContactPhone, p.Description, p.Status,
		p.SubmittedAt, p.CreatedAt, p.UpdatedAt, p.Version)
	return mapErr(err)
}

func (s *Store) GetByID(ctx context.Context, id string) (domain.Profile, error) {
	return scanProfile(rowQ(ctx, s, profileSelect+` WHERE id = $1`, id))
}

func (s *Store) GetByOwner(ctx context.Context, ownerID string) (domain.Profile, error) {
	return scanProfile(rowQ(ctx, s, profileSelect+` WHERE owner_user_id = $1`, ownerID))
}

func (s *Store) Update(ctx context.Context, p domain.Profile, expectedVersion int) error {
	tag, err := exec(ctx, s, `
		UPDATE organizer_profiles SET
		  name = $1, contact_email = $2, contact_phone = $3, description = $4, status = $5,
		  decision_reason = $6, submitted_at = $7, decided_at = $8, decided_by_user_id = $9,
		  updated_at = $10, version = version + 1
		WHERE id = $11 AND version = $12`,
		p.Name, p.ContactEmail, p.ContactPhone, p.Description, p.Status,
		p.DecisionReason, p.SubmittedAt, p.DecidedAt, p.DecidedByUserID,
		p.UpdatedAt, p.ID, expectedVersion)
	if err != nil {
		return mapErr(err)
	}
	cmd, ok := tag.(pgconn.CommandTag)
	if ok && cmd.RowsAffected() == 0 {
		return domain.ErrVersionConflict
	}
	return nil
}

func (s *Store) List(ctx context.Context, status, q string, limit int, cursorAt *time.Time, cursorID string) ([]domain.Profile, error) {
	q = strings.TrimSpace(q)
	rows, err := query(ctx, s, profileSelect+`
		WHERE ($1::text = '' OR status::text = $1)
		  AND ($2::text = '' OR name ILIKE '%' || $2 || '%')
		  AND ($3::timestamptz IS NULL OR (submitted_at, id) > ($3, $4))
		ORDER BY submitted_at ASC, id ASC
		LIMIT $5`, status, q, cursorAt, cursorID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Profile
	for rows.Next() {
		p, err := scanRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

const profileSelect = `
SELECT id, owner_user_id, name, contact_email, contact_phone, description, status::text,
       decision_reason, submitted_at, decided_at, decided_by_user_id, created_at, updated_at, version
FROM organizer_profiles`

func scanProfile(row pgx.Row) (domain.Profile, error) {
	p, err := scanDest(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Profile{}, domain.ErrNotFound
	}
	return p, err
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanRow(rows pgx.Rows) (domain.Profile, error) {
	return scanDest(rows)
}

func scanDest(row rowScanner) (domain.Profile, error) {
	var p domain.Profile
	var status string
	err := row.Scan(&p.ID, &p.OwnerUserID, &p.Name, &p.ContactEmail, &p.ContactPhone, &p.Description, &status,
		&p.DecisionReason, &p.SubmittedAt, &p.DecidedAt, &p.DecidedByUserID, &p.CreatedAt, &p.UpdatedAt, &p.Version)
	p.Status = domain.Status(status)
	return p, err
}

func mapErr(err error) error {
	if err == nil {
		return nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return domain.ErrExists
	}
	return err
}

func exec(ctx context.Context, s *Store, sql string, args ...any) (any, error) {
	if tx := platdb.TxFrom(ctx); tx != nil {
		return tx.Exec(ctx, sql, args...)
	}
	return s.pool.Exec(ctx, sql, args...)
}

func rowQ(ctx context.Context, s *Store, sql string, args ...any) pgx.Row {
	if tx := platdb.TxFrom(ctx); tx != nil {
		return tx.QueryRow(ctx, sql, args...)
	}
	return s.pool.QueryRow(ctx, sql, args...)
}

func query(ctx context.Context, s *Store, sql string, args ...any) (pgx.Rows, error) {
	if tx := platdb.TxFrom(ctx); tx != nil {
		return tx.Query(ctx, sql, args...)
	}
	return s.pool.Query(ctx, sql, args...)
}
