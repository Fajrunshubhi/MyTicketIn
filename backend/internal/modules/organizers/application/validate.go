package application

import (
	"net/mail"
	"regexp"
	"strings"
	"unicode/utf8"

	authapp "myticketin/internal/modules/auth/application"
	"myticketin/internal/modules/organizers/domain"
)

var phoneRE = regexp.MustCompile(`^\+?[0-9]{8,15}$`)

func NormalizeInput(name, email, phone, description string) (string, string, *string, string, error) {
	fields := authapp.FieldErrors{}
	name = strings.TrimSpace(name)
	n := utf8.RuneCountInString(name)
	if n < 2 || n > 120 {
		fields["name"] = "Nama organizer wajib 2–120 karakter."
	}
	email = strings.ToLower(strings.TrimSpace(email))
	if utf8.RuneCountInString(email) > 254 {
		fields["contactEmail"] = "Email kontak terlalu panjang."
	} else if _, err := mail.ParseAddress(email); err != nil || !strings.Contains(email, "@") {
		fields["contactEmail"] = "Email kontak tidak valid."
	}
	phone = strings.TrimSpace(phone)
	var phonePtr *string
	if phone != "" {
		if !phoneRE.MatchString(phone) {
			fields["contactPhone"] = "Nomor telepon 8–15 digit, boleh diawali +."
		} else {
			p := phone
			phonePtr = &p
		}
	}
	description = strings.TrimSpace(description)
	d := utf8.RuneCountInString(description)
	if d < 20 || d > 2000 {
		fields["description"] = "Deskripsi wajib 20–2000 karakter."
	}
	if len(fields) > 0 {
		return "", "", nil, "", authapp.ValidationError{Fields: fields}
	}
	return name, email, phonePtr, description, nil
}

func ValidateReason(reason string) (string, error) {
	reason = strings.TrimSpace(reason)
	n := utf8.RuneCountInString(reason)
	if n < 10 || n > 1000 {
		return "", domain.ErrReasonRequired
	}
	return reason, nil
}
