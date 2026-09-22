package db

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"

	"myticketin/internal/platform/db/sqlcdb"
)

type UserRecord struct {
	ID        string
	Name      string
	Username  string
	Email     string
	Role      string
	CreatedAt string
}

type UserRepository struct {
	q *sqlcdb.Queries
}

func NewUserRepository(pool *Pool) *UserRepository {
	return &UserRepository{q: sqlcdb.New(pool.Raw())}
}

func NewID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}

func (r *UserRepository) Create(ctx context.Context, name, username, email, role string, passwordHash *string) (UserRecord, error) {
	id, err := NewID()
	if err != nil {
		return UserRecord{}, err
	}
	row, err := r.q.CreateUser(ctx, sqlcdb.CreateUserParams{
		ID:           id,
		Name:         name,
		Username:     username,
		Email:        email,
		PasswordHash: passwordHash,
		Role:         role,
	})
	if err != nil {
		return UserRecord{}, fmt.Errorf("create user: %w", err)
	}
	return mapUser(row), nil
}

func (r *UserRepository) GetByID(ctx context.Context, id string) (UserRecord, error) {
	row, err := r.q.GetUserByID(ctx, id)
	if err != nil {
		return UserRecord{}, err
	}
	return mapUser(row), nil
}

func mapUser(row sqlcdb.User) UserRecord {
	return UserRecord{
		ID:        row.ID,
		Name:      row.Name,
		Username:  row.Username,
		Email:     row.Email,
		Role:      row.Role,
		CreatedAt: row.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
}
