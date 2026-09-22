package application

import (
	"errors"
	"testing"

	"myticketin/internal/modules/auth/domain"
)

func TestParseRegisterIntent(t *testing.T) {
	got, err := ParseRegisterIntent("")
	if err != nil || got != domain.PortalBuyer {
		t.Fatalf("empty intent %q %v", got, err)
	}
	got, err = ParseRegisterIntent("organizer")
	if err != nil || got != domain.PortalBuyer {
		t.Fatalf("organizer intent maps to buyer %q %v", got, err)
	}
	if _, err := ParseRegisterIntent("admin"); err == nil {
		t.Fatal("admin intent must fail")
	}
}

func TestAuthorizePortal(t *testing.T) {
	buyer := Access{Kind: domain.PortalBuyer, CanBuy: true, CanApplyOrganizer: true}
	admin := Access{Kind: domain.PortalAdmin, IsAdmin: true}
	if err := AuthorizePortal(domain.PortalBuyer, buyer); err != nil {
		t.Fatal(err)
	}
	if err := AuthorizePortal(domain.PortalAdmin, buyer); err == nil || !errors.Is(err, domain.ErrPortalDenied) {
		t.Fatalf("buyer as admin: %v", err)
	}
	if err := AuthorizePortal(domain.PortalBuyer, admin); err == nil || !errors.Is(err, domain.ErrPortalDenied) {
		t.Fatalf("admin as buyer: %v", err)
	}
	if err := AuthorizePortal(domain.PortalOrganizer, buyer); err == nil || !errors.Is(err, domain.ErrPortalDenied) {
		t.Fatalf("buyer as organizer: %v", err)
	}
	var pe domain.PortalDeniedError
	if !errors.As(AuthorizePortal(domain.PortalOrganizer, buyer), &pe) || pe.Reason != domain.PortalDeniedApplyAfterLogin {
		t.Fatalf("buyer as organizer reason %+v", pe)
	}
	organizer := Access{Kind: domain.PortalOrganizer, CanOrganize: true}
	if err := AuthorizePortal(domain.PortalBuyer, organizer); err == nil || !errors.Is(err, domain.ErrPortalDenied) {
		t.Fatalf("approved organizer as buyer: %v", err)
	}
	if !errors.As(AuthorizePortal(domain.PortalBuyer, organizer), &pe) || pe.Reason != domain.PortalDeniedOrganizerOnly {
		t.Fatalf("organizer as buyer reason %+v", pe)
	}
	if err := AuthorizePortal(domain.PortalOrganizer, organizer); err != nil {
		t.Fatal(err)
	}
	if err := AuthorizePortal(domain.PortalAdmin, admin); err != nil {
		t.Fatal(err)
	}
}

func TestPortalNextPathIgnoresForeignCallback(t *testing.T) {
	acc := Access{Kind: domain.PortalBuyer, CanBuy: true, CanApplyOrganizer: true}
	if got := PortalNextPath(domain.PortalBuyer, acc, "/admin/events"); got != "/" {
		t.Fatalf("got %s", got)
	}
	if got := PortalNextPath(domain.PortalBuyer, acc, "/organizer/apply"); got != "/organizer/apply" {
		t.Fatalf("buyer apply %s", got)
	}
	if got := PortalNextPath(domain.PortalBuyer, acc, "/organizer/events"); got != "/" {
		t.Fatalf("buyer events %s", got)
	}
	if got := PortalNextPath(domain.PortalBuyer, acc, ""); got != "/" {
		t.Fatalf("buyer default %s", got)
	}
	admin := Access{Kind: domain.PortalAdmin, IsAdmin: true}
	if got := PortalNextPath(domain.PortalAdmin, admin, ""); got != "/dashboard" {
		t.Fatalf("admin home %s", got)
	}
	if got := PortalNextPath(domain.PortalAdmin, admin, "/admin/events"); got != "/admin/events" {
		t.Fatalf("got %s", got)
	}
	buyerOrg := Access{Kind: domain.PortalBuyer, CanBuy: true, CanApplyOrganizer: true}
	if got := PortalNextPath(domain.PortalOrganizer, buyerOrg, "/organizer/apply"); got != "/" {
		t.Fatalf("unapproved organizer portal path %s", got)
	}
	organizer := Access{Kind: domain.PortalOrganizer, CanOrganize: true}
	if got := PortalNextPath(domain.PortalOrganizer, organizer, ""); got != "/" {
		t.Fatalf("organizer default %s", got)
	}
	if got := PortalNextPath(domain.PortalOrganizer, organizer, "/dashboard/event"); got != "/dashboard/event" {
		t.Fatalf("organizer dashboard event %s", got)
	}
}
