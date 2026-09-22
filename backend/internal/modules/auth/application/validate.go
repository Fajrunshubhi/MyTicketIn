package application

import (
	"fmt"
	"net/mail"
	"regexp"
	"strings"
	"unicode/utf8"

	"myticketin/internal/modules/auth/domain"
)

var usernameRE = regexp.MustCompile(`^[a-z0-9._-]{3,40}$`)

type FieldErrors map[string]string

type ValidationError struct {
	Fields FieldErrors
}

func (e ValidationError) Error() string {
	return domain.ErrValidation.Error()
}

func NormalizeEmail(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func NormalizeUsername(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func ValidateRegister(name, username, email, password, confirm string) error {
	fields := FieldErrors{}
	name = strings.TrimSpace(name)
	n := utf8.RuneCountInString(name)
	if n < 2 || n > 120 {
		fields["name"] = "Nama wajib 2–120 karakter."
	}
	username = NormalizeUsername(username)
	if !usernameRE.MatchString(username) {
		fields["username"] = "Username 3–40 karakter: huruf kecil, angka, titik, underscore, atau strip."
	}
	email = NormalizeEmail(email)
	if utf8.RuneCountInString(email) > 254 {
		fields["email"] = "Email terlalu panjang."
	} else if _, err := mail.ParseAddress(email); err != nil || !strings.Contains(email, "@") {
		fields["email"] = "Format email tidak valid."
	}
	if len(password) < 10 || len(password) > 128 {
		fields["password"] = "Kata sandi wajib 10–128 karakter."
	}
	if password != confirm {
		fields["confirmPassword"] = "Konfirmasi kata sandi tidak sama."
	}
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func ValidateProfile(name, email string) error {
	fields := FieldErrors{}
	n := utf8.RuneCountInString(strings.TrimSpace(name))
	if n < 2 || n > 120 {
		fields["name"] = "Nama wajib 2–120 karakter."
	}
	email = NormalizeEmail(email)
	if utf8.RuneCountInString(email) > 254 {
		fields["email"] = "Email terlalu panjang."
	} else if _, err := mail.ParseAddress(email); err != nil || !strings.Contains(email, "@") {
		fields["email"] = "Format email tidak valid."
	}
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func SafeCallbackPath(raw, fallback string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback
	}
	if strings.HasPrefix(raw, "/") && !strings.HasPrefix(raw, "//") && !strings.Contains(raw, "\\") {
		return raw
	}
	return fallback
}

func HashRateKey(scope, ip, identifier string) string {
	return fmt.Sprintf("%s|%s|%s", scope, ip, strings.ToLower(strings.TrimSpace(identifier)))
}
