package application

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	analyticsapp "myticketin/internal/modules/analytics/application"
	auditdomain "myticketin/internal/modules/audit/domain"
	"myticketin/internal/modules/auth/domain"
	"myticketin/internal/platform/db"
)

type Auditor interface {
	Record(ctx context.Context, rec auditdomain.Record) error
}

type Analytics interface {
	Emit(ctx context.Context, in analyticsapp.Input) error
}

type UserStore interface {
	CreateLocal(ctx context.Context, id, name, username, email, passwordHash string) (domain.User, error)
	CreateOAuth(ctx context.Context, id, name, username, email string) (domain.User, error)
	GetByID(ctx context.Context, id string) (domain.User, error)
	GetByUsernameOrEmail(ctx context.Context, identifier string) (domain.User, error)
	GetByProvider(ctx context.Context, provider, providerAccountID string) (domain.User, error)
	LinkAccount(ctx context.Context, accountID, userID, provider, providerAccountID string) error
	IncrementAuthVersion(ctx context.Context, userID string) (int, error)
	TouchLastLogin(ctx context.Context, userID string) error
	UpdatePassword(ctx context.Context, userID, passwordHash string) error
	UpdateProfile(ctx context.Context, userID, name, email string) (domain.User, error)
}

type SessionStore interface {
	Create(ctx context.Context, sess domain.Session) error
	GetByTokenHash(ctx context.Context, tokenHash string) (domain.Session, domain.User, error)
	DeleteByTokenHash(ctx context.Context, tokenHash string) error
	DeleteByUser(ctx context.Context, userID string) error
}

type RateStore interface {
	Hit(ctx context.Context, keyHash, scope string, window time.Duration) (int, error)
}

type Service struct {
	Users      UserStore
	Sessions   SessionStore
	Rates      RateStore
	Hasher     Hasher
	Policies   *domain.Registry
	Now        func() time.Time
	Dummy      string
	UoW        func(ctx context.Context, fn func(context.Context) error) error
	Audit      Auditor
	Analytics  Analytics
	Organizers OrganizerStatusLookup
	Resets     ResetStore
	Mail       MailSender
	Notify     Notifier
	// RelaxedLimits enlarges auth quotas for local development only.
	RelaxedLimits bool
}

func NewService(users UserStore, sessions SessionStore, rates RateStore, hasher Hasher) *Service {
	dummy, _ := hasher.Hash("not-a-real-account-dummy")
	return &Service{
		Users:    users,
		Sessions: sessions,
		Rates:    rates,
		Hasher:   hasher,
		Policies: domain.NewRegistry(),
		Now:      func() time.Time { return time.Now().UTC() },
		Dummy:    dummy,
	}
}

func (s *Service) Register(ctx context.Context, name, username, email, password, confirm, ip string) (domain.User, error) {
	if err := ValidateRegister(name, username, email, password, confirm); err != nil {
		return domain.User{}, err
	}
	username = NormalizeUsername(username)
	email = NormalizeEmail(email)
	if err := s.limit(ctx, "register", ip, "", 5); err != nil {
		return domain.User{}, err
	}
	if err := s.limit(ctx, "register", ip, email, 3); err != nil {
		return domain.User{}, err
	}
	hash, err := s.Hasher.Hash(password)
	if err != nil {
		return domain.User{}, domain.ErrUnavailable
	}
	id, err := db.NewID()
	if err != nil {
		return domain.User{}, domain.ErrUnavailable
	}
	var user domain.User
	err = s.inTx(ctx, func(ctx context.Context) error {
		created, err := s.Users.CreateLocal(ctx, id, strings.TrimSpace(name), username, email, hash)
		if err != nil {
			return err
		}
		user = created
		return s.record(ctx, auditdomain.Record{
			ActorType:   auditdomain.ActorUser,
			ActorUserID: &user.ID,
			Action:      "user.register",
			EntityType:  "User",
			EntityID:    &user.ID,
			Outcome:     auditdomain.OutcomeSuccess,
			After: map[string]any{
				"id":       user.ID,
				"username": user.Username,
				"role":     string(user.Role),
				"status":   string(user.Status),
			},
			Metadata: map[string]any{"source": "api"},
		})
	})
	if err != nil {
		return domain.User{}, err
	}
	s.emit(ctx, analyticsapp.Input{
		Name:        "user_registered",
		ActorUserID: user.ID,
		EntityType:  "User",
		EntityID:    user.ID,
		Properties:  map[string]any{"source": "api", "entityType": "User", "entityId": user.ID},
	})
	return user, nil
}

func (s *Service) Login(ctx context.Context, identifier, password, ip, portal string) (domain.User, domain.Session, string, string, error) {
	identifier = strings.ToLower(strings.TrimSpace(identifier))
	if identifier == "" || password == "" {
		s.Hasher.Compare(s.Dummy, password)
		s.emit(ctx, analyticsapp.Input{Name: "login_failed", ReasonCode: "AUTH_INVALID_CREDENTIALS", AnonymousSeed: ip, Properties: map[string]any{"source": "api", "reasonCode": "AUTH_INVALID_CREDENTIALS"}})
		return domain.User{}, domain.Session{}, "", "", domain.ErrInvalidCredentials
	}
	if err := s.limit(ctx, "login", ip, identifier, 10); err != nil {
		return domain.User{}, domain.Session{}, "", "", err
	}
	user, err := s.Users.GetByUsernameOrEmail(ctx, identifier)
	if err != nil {
		s.Hasher.Compare(s.Dummy, password)
		s.emit(ctx, analyticsapp.Input{Name: "login_failed", ReasonCode: "AUTH_INVALID_CREDENTIALS", AnonymousSeed: ip, Properties: map[string]any{"source": "api", "reasonCode": "AUTH_INVALID_CREDENTIALS"}})
		return domain.User{}, domain.Session{}, "", "", domain.ErrInvalidCredentials
	}
	if user.PasswordHash == nil || *user.PasswordHash == "" {
		s.Hasher.Compare(s.Dummy, password)
		s.emit(ctx, analyticsapp.Input{Name: "login_failed", ReasonCode: "AUTH_INVALID_CREDENTIALS", AnonymousSeed: ip, Properties: map[string]any{"source": "api", "reasonCode": "AUTH_INVALID_CREDENTIALS"}})
		return domain.User{}, domain.Session{}, "", "", domain.ErrInvalidCredentials
	}
	if !s.Hasher.Compare(*user.PasswordHash, password) {
		s.emit(ctx, analyticsapp.Input{Name: "login_failed", ReasonCode: "AUTH_INVALID_CREDENTIALS", AnonymousSeed: ip, Properties: map[string]any{"source": "api", "reasonCode": "AUTH_INVALID_CREDENTIALS"}})
		return domain.User{}, domain.Session{}, "", "", domain.ErrInvalidCredentials
	}
	if err := s.guardStatus(user); err != nil {
		return domain.User{}, domain.Session{}, "", "", err
	}
	portalRaw := portal
	acc := s.AccessFor(ctx, user)
	portal, err = ResolvePortal(portalRaw, acc)
	if err != nil {
		return domain.User{}, domain.Session{}, "", "", err
	}
	if err := AuthorizePortal(portal, acc); err != nil {
		s.emit(ctx, analyticsapp.Input{Name: "login_failed", ReasonCode: "AUTH_PORTAL_DENIED", ActorUserID: user.ID, Properties: map[string]any{"source": "api", "reasonCode": "AUTH_PORTAL_DENIED", "portal": portal}})
		return domain.User{}, domain.Session{}, "", "", err
	}
	var sess domain.Session
	var raw, csrf string
	err = s.inTx(ctx, func(ctx context.Context) error {
		issued, r, c, err := s.issueSession(ctx, user)
		if err != nil {
			return err
		}
		sess, raw, csrf = issued, r, c
		if err := s.Users.TouchLastLogin(ctx, user.ID); err != nil {
			return err
		}
		return s.record(ctx, auditdomain.Record{
			ActorType:   auditdomain.ActorUser,
			ActorUserID: &user.ID,
			Action:      "user.login",
			EntityType:  "User",
			EntityID:    &user.ID,
			Outcome:     auditdomain.OutcomeSuccess,
			After:       map[string]any{"id": user.ID, "role": string(user.Role)},
			Metadata:    map[string]any{"source": "api", "portal": portal},
		})
	})
	if err != nil {
		return domain.User{}, domain.Session{}, "", "", err
	}
	s.emit(ctx, analyticsapp.Input{
		Name:        "login_succeeded",
		ActorUserID: user.ID,
		EntityType:  "User",
		EntityID:    user.ID,
		Properties:  map[string]any{"source": "api", "entityType": "User", "entityId": user.ID},
	})
	return user, sess, raw, csrf, nil
}

func (s *Service) ResolveGoogle(ctx context.Context, profile domain.GoogleProfile, actor *domain.User, ip string) (domain.User, domain.Session, string, string, error) {
	if err := s.limit(ctx, "oauth", ip, profile.Subject, 20); err != nil {
		return domain.User{}, domain.Session{}, "", "", err
	}
	if !profile.EmailVerified || profile.Email == "" || profile.Subject == "" {
		return domain.User{}, domain.Session{}, "", "", domain.ErrOAuthFailed
	}
	email := NormalizeEmail(profile.Email)
	if existing, err := s.Users.GetByProvider(ctx, "google", profile.Subject); err == nil {
		if err := s.guardStatus(existing); err != nil {
			return domain.User{}, domain.Session{}, "", "", err
		}
		sess, raw, csrf, err := s.issueSession(ctx, existing)
		return existing, sess, raw, csrf, err
	}
	byEmail, emailErr := s.Users.GetByUsernameOrEmail(ctx, email)
	if emailErr == nil {
		if actor == nil || actor.ID != byEmail.ID {
			return domain.User{}, domain.Session{}, "", "", domain.ErrAccountLinkRequired
		}
		if err := s.guardStatus(byEmail); err != nil {
			return domain.User{}, domain.Session{}, "", "", err
		}
		accID, err := db.NewID()
		if err != nil {
			return domain.User{}, domain.Session{}, "", "", domain.ErrUnavailable
		}
		if err := s.Users.LinkAccount(ctx, accID, byEmail.ID, "google", profile.Subject); err != nil {
			return domain.User{}, domain.Session{}, "", "", err
		}
		sess, raw, csrf, err := s.issueSession(ctx, byEmail)
		return byEmail, sess, raw, csrf, err
	}
	id, err := db.NewID()
	if err != nil {
		return domain.User{}, domain.Session{}, "", "", domain.ErrUnavailable
	}
	username := googleUsername(email)
	name := strings.TrimSpace(profile.Name)
	if name == "" {
		name = username
	}
	created, err := s.Users.CreateOAuth(ctx, id, name, username, email)
	if err != nil {
		return domain.User{}, domain.Session{}, "", "", err
	}
	accID, err := db.NewID()
	if err != nil {
		return domain.User{}, domain.Session{}, "", "", domain.ErrUnavailable
	}
	if err := s.Users.LinkAccount(ctx, accID, created.ID, "google", profile.Subject); err != nil {
		return domain.User{}, domain.Session{}, "", "", err
	}
	sess, raw, csrf, err := s.issueSession(ctx, created)
	return created, sess, raw, csrf, err
}

func (s *Service) SessionFromToken(ctx context.Context, raw string) (domain.User, domain.Session, error) {
	if raw == "" {
		return domain.User{}, domain.Session{}, domain.ErrRequired
	}
	sess, user, err := s.Sessions.GetByTokenHash(ctx, TokenHash(raw))
	if err != nil {
		return domain.User{}, domain.Session{}, domain.ErrRequired
	}
	if !s.Now().Before(sess.ExpiresAt) {
		_ = s.Sessions.DeleteByTokenHash(ctx, sess.TokenHash)
		return domain.User{}, domain.Session{}, domain.ErrSessionExpired
	}
	if user.AuthVersion != sess.AuthVersion {
		_ = s.Sessions.DeleteByTokenHash(ctx, sess.TokenHash)
		return domain.User{}, domain.Session{}, domain.ErrSessionExpired
	}
	if err := s.guardStatus(user); err != nil {
		return domain.User{}, domain.Session{}, err
	}
	return user, sess, nil
}

func (s *Service) SignOut(ctx context.Context, raw string) error {
	if raw == "" {
		return nil
	}
	return s.Sessions.DeleteByTokenHash(ctx, TokenHash(raw))
}

func (s *Service) RevokeAll(ctx context.Context, user domain.User) error {
	if err := s.Policies.Authorize(domain.Actor{User: user}, domain.ActionRevokeSessions, domain.Resource{OwnerID: user.ID}); err != nil {
		s.emit(ctx, analyticsapp.Input{Name: "access_denied", ActorUserID: user.ID, ReasonCode: err.Error(), Properties: map[string]any{"source": "api", "reasonCode": err.Error()}})
		return err
	}
	return s.inTx(ctx, func(ctx context.Context) error {
		if _, err := s.Users.IncrementAuthVersion(ctx, user.ID); err != nil {
			return err
		}
		if err := s.Sessions.DeleteByUser(ctx, user.ID); err != nil {
			return err
		}
		return s.record(ctx, auditdomain.Record{
			ActorType:   auditdomain.ActorUser,
			ActorUserID: &user.ID,
			Action:      "user.sessions.revoke",
			EntityType:  "User",
			EntityID:    &user.ID,
			Outcome:     auditdomain.OutcomeSuccess,
			Metadata:    map[string]any{"source": "api"},
		})
	})
}

func (s *Service) UpdateProfile(ctx context.Context, actor domain.User, name, email string) (domain.User, error) {
	if err := ValidateProfile(name, email); err != nil {
		return domain.User{}, err
	}
	name = strings.TrimSpace(name)
	email = NormalizeEmail(email)
	other, err := s.Users.GetByUsernameOrEmail(ctx, email)
	if err == nil && other.ID != actor.ID {
		return domain.User{}, domain.ErrEmailExists
	}
	if err != nil && !errors.Is(err, domain.ErrInvalidCredentials) && !errors.Is(err, domain.ErrRequired) {
		return domain.User{}, err
	}
	return s.Users.UpdateProfile(ctx, actor.ID, name, email)
}

func (s *Service) ViewProfile(ctx context.Context, actor domain.User, targetID string) error {
	err := s.Policies.Authorize(domain.Actor{User: actor}, domain.ActionViewProfile, domain.Resource{ID: targetID, OwnerID: targetID})
	if err != nil {
		s.emit(ctx, analyticsapp.Input{Name: "access_denied", ActorUserID: actor.ID, ReasonCode: err.Error(), EntityType: "User", EntityID: targetID, Properties: map[string]any{"source": "api", "reasonCode": err.Error()}})
	}
	return err
}

func (s *Service) AdminPing(ctx context.Context, actor domain.User) error {
	err := s.Policies.Authorize(domain.Actor{User: actor}, domain.ActionAdminPing, domain.Resource{})
	if err != nil {
		s.emit(ctx, analyticsapp.Input{Name: "access_denied", ActorUserID: actor.ID, ReasonCode: err.Error(), Properties: map[string]any{"source": "api", "reasonCode": err.Error()}})
	}
	return err
}

func (s *Service) AdminAudit(ctx context.Context, actor domain.User) error {
	err := s.Policies.Authorize(domain.Actor{User: actor}, domain.ActionAdminAudit, domain.Resource{})
	if err != nil {
		s.emit(ctx, analyticsapp.Input{Name: "access_denied", ActorUserID: actor.ID, ReasonCode: err.Error(), Properties: map[string]any{"source": "api", "reasonCode": err.Error()}})
	}
	return err
}

func (s *Service) guardStatus(user domain.User) error {
	switch user.Status {
	case domain.StatusActive:
		return nil
	case domain.StatusSuspended:
		return domain.ErrAccountSuspended
	case domain.StatusDisabled:
		return domain.ErrAccountDisabled
	default:
		return domain.ErrForbidden
	}
}

func (s *Service) issueSession(ctx context.Context, user domain.User) (domain.Session, string, string, error) {
	raw, err := randomToken()
	if err != nil {
		return domain.Session{}, "", "", domain.ErrUnavailable
	}
	csrf, err := randomToken()
	if err != nil {
		return domain.Session{}, "", "", domain.ErrUnavailable
	}
	id, err := db.NewID()
	if err != nil {
		return domain.Session{}, "", "", domain.ErrUnavailable
	}
	sess := domain.Session{
		ID:          id,
		UserID:      user.ID,
		TokenHash:   TokenHash(raw),
		CSRFHash:    TokenHash(csrf),
		AuthVersion: user.AuthVersion,
		ExpiresAt:   s.Now().Add(domain.SessionTTL),
	}
	if err := s.Sessions.Create(ctx, sess); err != nil {
		return domain.Session{}, "", "", err
	}
	return sess, raw, csrf, nil
}

func (s *Service) limit(ctx context.Context, scope, ip, identifier string, max int) error {
	if s.Rates == nil {
		return nil
	}
	if s.RelaxedLimits && max < 100 {
		max = 100
	}
	key := TokenHash(HashRateKey(scope, ip, identifier))
	n, err := s.Rates.Hit(ctx, key, scope, time.Hour)
	if err != nil {
		return domain.ErrUnavailable
	}
	if n > max {
		return domain.ErrRateLimited
	}
	return nil
}

func TokenHash(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func randomToken() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}

func (s *Service) inTx(ctx context.Context, fn func(context.Context) error) error {
	if s.UoW == nil {
		return fn(ctx)
	}
	return s.UoW(ctx, fn)
}

func (s *Service) record(ctx context.Context, rec auditdomain.Record) error {
	if s.Audit == nil {
		return nil
	}
	return s.Audit.Record(ctx, rec)
}

func (s *Service) emit(ctx context.Context, in analyticsapp.Input) {
	if s.Analytics == nil {
		return
	}
	_ = s.Analytics.Emit(ctx, in)
}

func googleUsername(email string) string {
	base := email
	if i := strings.Index(email, "@"); i > 0 {
		base = email[:i]
	}
	var b strings.Builder
	for _, r := range strings.ToLower(base) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '.' || r == '_' || r == '-' {
			b.WriteRune(r)
		}
	}
	out := b.String()
	if len(out) < 3 {
		out = "user" + out
	}
	if len(out) > 40 {
		out = out[:40]
	}
	return out
}
