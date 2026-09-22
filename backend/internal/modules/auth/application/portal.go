package application

import (
	"context"
	"strings"

	"myticketin/internal/modules/auth/domain"
)

type OrganizerStatusLookup interface {
	LookupOrganizerStatus(ctx context.Context, ownerUserID string) (status string, found bool, err error)
}

type Access struct {
	Kind              string  `json:"kind"`
	IsAdmin           bool    `json:"isAdmin"`
	CanBuy            bool    `json:"canBuy"`
	CanOrganize       bool    `json:"canOrganize"`
	CanApplyOrganizer bool    `json:"canApplyOrganizer"`
	OrganizerStatus   *string `json:"organizerStatus"`
}

func ParsePortal(raw string) (string, error) {
	v := strings.ToLower(strings.TrimSpace(raw))
	if v == "" {
		return domain.PortalBuyer, nil
	}
	switch v {
	case domain.PortalBuyer, domain.PortalOrganizer, domain.PortalAdmin:
		return v, nil
	default:
		return "", ValidationError{Fields: FieldErrors{"portal": "Pilih pembeli tiket, penyelenggara, atau admin aplikasi."}}
	}
}

func ParseRegisterIntent(raw string) (string, error) {
	v := strings.ToLower(strings.TrimSpace(raw))
	if v == "" || v == domain.PortalBuyer || v == domain.PortalOrganizer {
		return domain.PortalBuyer, nil
	}
	if v == domain.PortalAdmin {
		return "", ValidationError{Fields: FieldErrors{"intent": "Admin aplikasi tidak didaftarkan melalui formulir ini."}}
	}
	return "", ValidationError{Fields: FieldErrors{"intent": "Daftar sebagai pembeli tiket. Pengajuan penyelenggara dilakukan setelah masuk."}}
}

func (s *Service) AccessFor(ctx context.Context, user domain.User) Access {
	acc := Access{
		Kind:              domain.PortalBuyer,
		IsAdmin:           user.Role == domain.RoleAdmin,
		CanBuy:            user.Role == domain.RoleUser,
		CanApplyOrganizer: user.Role == domain.RoleUser,
	}
	if acc.IsAdmin {
		acc.Kind = domain.PortalAdmin
		acc.CanBuy = false
		acc.CanApplyOrganizer = false
		return acc
	}
	if s.Organizers == nil {
		return acc
	}
	status, found, err := s.Organizers.LookupOrganizerStatus(ctx, user.ID)
	if err != nil || !found {
		return acc
	}
	acc.OrganizerStatus = &status
	if strings.EqualFold(status, "APPROVED") {
		acc.CanOrganize = true
		acc.CanBuy = false
		acc.CanApplyOrganizer = false
		acc.Kind = domain.PortalOrganizer
	}
	return acc
}

func ResolvePortal(raw string, acc Access) (string, error) {
	if strings.TrimSpace(raw) == "" {
		if acc.Kind == "" {
			return domain.PortalBuyer, nil
		}
		return acc.Kind, nil
	}
	return ParsePortal(raw)
}

func AuthorizePortal(portal string, acc Access) error {
	switch portal {
	case domain.PortalAdmin:
		if !acc.IsAdmin {
			return domain.PortalDeniedError{Reason: domain.PortalDeniedNotAdmin}
		}
		return nil
	case domain.PortalOrganizer:
		if acc.IsAdmin {
			return domain.PortalDeniedError{Reason: domain.PortalDeniedAdminOnly}
		}
		if !acc.CanOrganize {
			return domain.PortalDeniedError{Reason: domain.PortalDeniedApplyAfterLogin}
		}
		return nil
	case domain.PortalBuyer:
		if acc.IsAdmin {
			return domain.PortalDeniedError{Reason: domain.PortalDeniedAdminOnly}
		}
		if acc.CanOrganize {
			return domain.PortalDeniedError{Reason: domain.PortalDeniedOrganizerOnly}
		}
		return nil
	default:
		return domain.ErrPortalDenied
	}
}

func PortalNextPath(portal string, acc Access, callback string) string {
	fallback := "/"
	switch portal {
	case domain.PortalAdmin:
		fallback = "/dashboard"
	default:
		fallback = "/"
	}
	path := SafeCallbackPath(callback, fallback)
	if !portalAllowsPath(portal, path) {
		return fallback
	}
	return path
}

func portalAllowsPath(portal, path string) bool {
	switch portal {
	case domain.PortalAdmin:
		return path == "/dashboard" || path == "/home" || strings.HasPrefix(path, "/admin/") || path == "/admin"
	case domain.PortalOrganizer:
		return path == "/" || path == "/dashboard" || strings.HasPrefix(path, "/dashboard/") || path == "/organizer/events" || strings.HasPrefix(path, "/organizer/events/") || path == "/organizer/dashboard"
	default:
		if strings.HasPrefix(path, "/admin") || strings.HasPrefix(path, "/organizer/events") {
			return false
		}
		return true
	}
}
