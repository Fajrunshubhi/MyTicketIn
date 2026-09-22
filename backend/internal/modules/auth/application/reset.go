package application

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"
	"unicode/utf8"

	auditdomain "myticketin/internal/modules/audit/domain"
	"myticketin/internal/modules/auth/domain"
	notifydomain "myticketin/internal/modules/notifications/domain"
	platdb "myticketin/internal/platform/db"
	"myticketin/internal/platform/logger"
)

type ResetStore interface {
	RevokeActiveTokens(ctx context.Context, userID string, now time.Time) error
	InsertToken(ctx context.Context, id, userID, tokenHash, ipHash string, adminID *string, expires time.Time) error
	GetTokenForUpdate(ctx context.Context, tokenHash string) (domain.PasswordResetToken, error)
	MarkTokenUsed(ctx context.Context, id string, now time.Time) error
}

type MailSender interface {
	Send(ctx context.Context, in notifydomain.EmailMessage) (string, error)
}

type Notifier interface {
	Enqueue(ctx context.Context, cmd notifydomain.Command) error
}

func (s *Service) RequestPasswordReset(ctx context.Context, email, ip string) error {
	email = NormalizeEmail(email)
	if err := s.resetLimits(ctx, email, ip); err != nil {
		return err
	}
	_ = s.Hasher.Compare(s.Dummy, "dummy-reset-probe")
	user, err := s.Users.GetByUsernameOrEmail(ctx, email)
	if err != nil || user.PasswordHash == nil || *user.PasswordHash == "" || !user.IsActive() {
		return nil
	}
	_, err = s.issueReset(ctx, user, ip, nil)
	return err
}

func (s *Service) AssistPasswordReset(ctx context.Context, actor domain.User, userID, reason string) (string, error) {
	if !actor.IsActive() || actor.Role != domain.RoleAdmin {
		return "", domain.ErrForbidden
	}
	reason = strings.TrimSpace(reason)
	if utf8.RuneCountInString(reason) < 10 || utf8.RuneCountInString(reason) > 1000 {
		return "", domain.ErrValidation
	}
	user, err := s.Users.GetByID(ctx, userID)
	if err != nil || user.PasswordHash == nil || *user.PasswordHash == "" || !user.IsActive() {
		return "", notifydomain.ErrResetNotEligible
	}
	raw, err := s.issueReset(ctx, user, "admin", &actor.ID)
	if err != nil {
		return "", err
	}
	if s.Audit != nil {
		_ = s.Audit.Record(ctx, auditdomain.Record{
			ActorType: auditdomain.ActorUser, ActorUserID: &actor.ID, Action: "auth.password_reset_assisted",
			EntityType: "User", EntityID: &user.ID, Outcome: auditdomain.OutcomeSuccess,
			After: map[string]any{"sandbox": true}, Metadata: map[string]any{"source": "api"},
			CorrelationID: logger.CorrelationFrom(ctx),
		})
	}
	if s.Notify != nil {
		_ = s.Notify.Enqueue(ctx, notifydomain.Command{
			DomainEventID: "password-reset-assist:" + user.ID + ":" + raw[:8],
			RecipientID:   user.ID, Type: notifydomain.TypePasswordResetAssisted, ActionPath: "/login",
		})
	}
	return raw, nil
}

func (s *Service) ConfirmPasswordReset(ctx context.Context, token, password, confirm string) error {
	if len(password) < 10 || len(password) > 128 || password != confirm {
		return ValidationError{Fields: FieldErrors{"newPassword": "Kata sandi wajib 10–128 karakter dan konfirmasi harus sama."}}
	}
	sum := sha256.Sum256([]byte(strings.TrimSpace(token)))
	hash := hex.EncodeToString(sum[:])
	return s.inTx(ctx, func(ctx context.Context) error {
		if s.Resets == nil {
			return notifydomain.ErrResetTokenInvalid
		}
		tok, err := s.Resets.GetTokenForUpdate(ctx, hash)
		if err != nil || tok.UsedAt != nil || tok.RevokedAt != nil || !s.Now().Before(tok.ExpiresAt) {
			return notifydomain.ErrResetTokenInvalid
		}
		user, err := s.Users.GetByID(ctx, tok.UserID)
		if err != nil || user.PasswordHash == nil || !user.IsActive() {
			return notifydomain.ErrResetTokenInvalid
		}
		newHash, err := s.Hasher.Hash(password)
		if err != nil {
			return err
		}
		if err := s.Users.UpdatePassword(ctx, user.ID, newHash); err != nil {
			return err
		}
		if _, err := s.Users.IncrementAuthVersion(ctx, user.ID); err != nil {
			return err
		}
		if err := s.Sessions.DeleteByUser(ctx, user.ID); err != nil {
			return err
		}
		return s.Resets.MarkTokenUsed(ctx, tok.ID, s.Now())
	})
}

func (s *Service) issueReset(ctx context.Context, user domain.User, ip string, adminID *string) (string, error) {
	if s.Resets == nil {
		return "", notifydomain.ErrResetAssistRequired
	}
	raw, err := randomToken()
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256([]byte(raw))
	tokenHash := hex.EncodeToString(sum[:])
	ipSum := sha256.Sum256([]byte(ip))
	id, err := platdb.NewID()
	if err != nil {
		return "", err
	}
	now := s.Now()
	err = s.inTx(ctx, func(ctx context.Context) error {
		if err := s.Resets.RevokeActiveTokens(ctx, user.ID, now); err != nil {
			return err
		}
		return s.Resets.InsertToken(ctx, id, user.ID, tokenHash, hex.EncodeToString(ipSum[:]), adminID, now.Add(notifydomain.ResetTTL))
	})
	if err != nil {
		return "", err
	}
	if s.Mail != nil {
		_, _ = s.Mail.Send(ctx, notifydomain.EmailMessage{
			TemplateKey: "password_reset", Idempotency: "reset|" + user.ID + "|" + id,
			Subject:  "[SANDBOX] Pemulihan kata sandi",
			TextBody: "SANDBOX/UJI. Token sekali pakai 30 menit. Buka /reset-password?token=" + raw,
		})
	}
	return raw, nil
}

func (s *Service) resetLimits(ctx context.Context, email, ip string) error {
	if s.Rates == nil {
		return nil
	}
	emailN, err := s.Rates.Hit(ctx, TokenHash(HashRateKey("password-reset-email", "", email)), "password-reset-email", time.Hour)
	if err != nil {
		return notifydomain.ErrResetRateLimited
	}
	ipN, err := s.Rates.Hit(ctx, TokenHash(HashRateKey("password-reset-ip", ip, "")), "password-reset-ip", time.Hour)
	if err != nil {
		return notifydomain.ErrResetRateLimited
	}
	if emailN > 3 || ipN > 10 {
		return notifydomain.ErrResetRateLimited
	}
	return nil
}
