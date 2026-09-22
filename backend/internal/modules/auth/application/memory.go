package application

import (
	"context"
	"strings"
	"sync"
	"time"

	"myticketin/internal/modules/auth/domain"
	notifydomain "myticketin/internal/modules/notifications/domain"
)

type Memory struct {
	mu       sync.Mutex
	users    map[string]domain.User
	byLogin  map[string]string
	accounts map[string]string
	sessions map[string]domain.Session
	rates    map[string]rateRow
	tokens   map[string]domain.PasswordResetToken
}

type rateRow struct {
	count   int
	started time.Time
}

func NewMemory() *Memory {
	return &Memory{
		users:    map[string]domain.User{},
		byLogin:  map[string]string{},
		accounts: map[string]string{},
		sessions: map[string]domain.Session{},
		rates:    map[string]rateRow{},
		tokens:   map[string]domain.PasswordResetToken{},
	}
}

func (m *Memory) CreateLocal(_ context.Context, id, name, username, email, passwordHash string) (domain.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.byLogin[username]; ok {
		return domain.User{}, domain.ErrUsernameExists
	}
	if _, ok := m.byLogin[email]; ok {
		return domain.User{}, domain.ErrEmailExists
	}
	hash := passwordHash
	u := domain.User{
		ID: id, Name: name, Username: username, Email: email,
		PasswordHash: &hash, Role: domain.RoleUser, Status: domain.StatusActive, AuthVersion: 1, CreatedAt: time.Now().UTC(),
	}
	m.users[id] = u
	m.byLogin[username] = id
	m.byLogin[email] = id
	return u, nil
}

func (m *Memory) CreateOAuth(_ context.Context, id, name, username, email string) (domain.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.byLogin[username]; ok {
		username = username + "1"
	}
	if _, ok := m.byLogin[email]; ok {
		return domain.User{}, domain.ErrEmailExists
	}
	u := domain.User{
		ID: id, Name: name, Username: username, Email: email,
		Role: domain.RoleUser, Status: domain.StatusActive, AuthVersion: 1, CreatedAt: time.Now().UTC(),
	}
	m.users[id] = u
	m.byLogin[username] = id
	m.byLogin[email] = id
	return u, nil
}

func (m *Memory) GetByID(_ context.Context, id string) (domain.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.users[id]
	if !ok {
		return domain.User{}, domain.ErrRequired
	}
	return u, nil
}

func (m *Memory) SearchActiveStaff(_ context.Context, q string, limit int) ([]domain.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	q = strings.ToLower(q)
	var out []domain.User
	for _, u := range m.users {
		if u.Role != domain.RoleUser || u.Status != domain.StatusActive {
			continue
		}
		if !strings.Contains(strings.ToLower(u.Name), q) && !strings.Contains(u.Username, q) && !strings.Contains(u.Email, q) {
			continue
		}
		out = append(out, u)
		if len(out) >= limit {
			break
		}
	}
	return out, nil
}

func (m *Memory) GetByUsernameOrEmail(_ context.Context, identifier string) (domain.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id, ok := m.byLogin[strings.ToLower(identifier)]
	if !ok {
		return domain.User{}, domain.ErrInvalidCredentials
	}
	return m.users[id], nil
}

func (m *Memory) GetByProvider(_ context.Context, provider, providerAccountID string) (domain.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id, ok := m.accounts[provider+"|"+providerAccountID]
	if !ok {
		return domain.User{}, domain.ErrRequired
	}
	return m.users[id], nil
}

func (m *Memory) LinkAccount(_ context.Context, _, userID, provider, providerAccountID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.accounts[provider+"|"+providerAccountID] = userID
	return nil
}

func (m *Memory) UpdatePassword(_ context.Context, userID, passwordHash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.users[userID]
	if !ok {
		return domain.ErrRequired
	}
	u.PasswordHash = &passwordHash
	m.users[userID] = u
	return nil
}

func (m *Memory) UpdateProfile(_ context.Context, userID, name, email string) (domain.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.users[userID]
	if !ok {
		return domain.User{}, domain.ErrRequired
	}
	if owner, taken := m.byLogin[email]; taken && owner != userID {
		return domain.User{}, domain.ErrEmailExists
	}
	if u.Email != email {
		delete(m.byLogin, u.Email)
		m.byLogin[email] = userID
	}
	u.Name = name
	u.Email = email
	m.users[userID] = u
	return u, nil
}

func (m *Memory) IncrementAuthVersion(_ context.Context, userID string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	u := m.users[userID]
	u.AuthVersion++
	m.users[userID] = u
	return u.AuthVersion, nil
}

func (m *Memory) TouchLastLogin(context.Context, string) error { return nil }

func (m *Memory) PromoteAdmin(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	u := m.users[id]
	u.Role = domain.RoleAdmin
	m.users[id] = u
}

func (m *Memory) Create(_ context.Context, sess domain.Session) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sessions[sess.TokenHash] = sess
	return nil
}

func (m *Memory) GetByTokenHash(_ context.Context, tokenHash string) (domain.Session, domain.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sess, ok := m.sessions[tokenHash]
	if !ok {
		return domain.Session{}, domain.User{}, domain.ErrRequired
	}
	return sess, m.users[sess.UserID], nil
}

func (m *Memory) DeleteByTokenHash(_ context.Context, tokenHash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, tokenHash)
	return nil
}

func (m *Memory) DeleteByUser(_ context.Context, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for k, s := range m.sessions {
		if s.UserID == userID {
			delete(m.sessions, k)
		}
	}
	return nil
}

func (m *Memory) Hit(_ context.Context, keyHash, _ string, window time.Duration) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	row, ok := m.rates[keyHash]
	if !ok || now.Sub(row.started) > window {
		m.rates[keyHash] = rateRow{count: 1, started: now}
		return 1, nil
	}
	row.count++
	m.rates[keyHash] = row
	return row.count, nil
}

func (m *Memory) RevokeActiveTokens(_ context.Context, userID string, now time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for k, t := range m.tokens {
		if t.UserID == userID && t.UsedAt == nil && t.RevokedAt == nil {
			t.RevokedAt = &now
			m.tokens[k] = t
		}
	}
	return nil
}

func (m *Memory) InsertToken(_ context.Context, id, userID, tokenHash, ipHash string, adminID *string, expires time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.tokens[tokenHash] = domain.PasswordResetToken{ID: id, UserID: userID, ExpiresAt: expires}
	_, _ = ipHash, adminID
	return nil
}

func (m *Memory) GetTokenForUpdate(_ context.Context, tokenHash string) (domain.PasswordResetToken, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.tokens[tokenHash]
	if !ok {
		return domain.PasswordResetToken{}, notifydomain.ErrResetTokenInvalid
	}
	return t, nil
}

func (m *Memory) MarkTokenUsed(_ context.Context, id string, now time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for k, t := range m.tokens {
		if t.ID == id {
			t.UsedAt = &now
			m.tokens[k] = t
			return nil
		}
	}
	return notifydomain.ErrResetTokenInvalid
}
