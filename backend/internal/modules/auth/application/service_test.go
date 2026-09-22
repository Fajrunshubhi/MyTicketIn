package application

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"myticketin/internal/modules/auth/domain"
)

func testService() (*Service, *Memory) {
	mem := NewMemory()
	h := StaticHasher{
		HashFn: func(p string) (string, error) { return "h:" + p, nil },
		CompareFn: func(hash, password string) bool {
			return hash == "h:"+password
		},
	}
	return NewService(mem, mem, mem, h), mem
}

func TestRegisterAndLogin(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()
	u, err := svc.Register(ctx, "Nama User", "namauser", "nama@example.test", "password12", "password12", "10.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	if u.Username != "namauser" || u.Email != "nama@example.test" {
		t.Fatalf("%+v", u)
	}
	_, _, raw, _, err := svc.Login(ctx, "nama@example.test", "password12", "10.0.0.1", domain.PortalBuyer)
	if err != nil {
		t.Fatal(err)
	}
	got, _, err := svc.SessionFromToken(ctx, raw)
	if err != nil || got.ID != u.ID {
		t.Fatalf("session %v %+v", err, got)
	}
	_, _, _, _, err = svc.Login(ctx, "nama@example.test", "wrongpass12", "10.0.0.1", domain.PortalBuyer)
	if err == nil || err.Error() != "AUTH_INVALID_CREDENTIALS" {
		t.Fatalf("generic invalid, got %v", err)
	}
}

func TestUpdateProfile(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()
	u, err := svc.Register(ctx, "Nama User", "namauser", "nama@example.test", "password12", "password12", "10.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	got, err := svc.UpdateProfile(ctx, u, "Nama Baru", "baru@example.test")
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "Nama Baru" || got.Email != "baru@example.test" {
		t.Fatalf("%+v", got)
	}
	_, err = svc.UpdateProfile(ctx, u, "X", "bukan-email")
	if err == nil {
		t.Fatal("expected validation")
	}
}

func TestRegisterRateLimit(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()
	for i := 0; i < 5; i++ {
		_, err := svc.Register(ctx, "Nama User", fmt.Sprintf("user%02d", i), fmt.Sprintf("u%02d@example.test", i), "password12", "password12", "10.0.0.9")
		if err != nil {
			t.Fatal(err)
		}
	}
	_, err := svc.Register(ctx, "Nama User", "userzz", "uz@example.test", "password12", "password12", "10.0.0.9")
	if err == nil || err.Error() != "AUTH_RATE_LIMITED" {
		t.Fatalf("got %v", err)
	}
}

func TestGoogleLinkRequired(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()
	if _, err := svc.Register(ctx, "Nama User", "namauser", "nama@example.test", "password12", "password12", "10.0.0.2"); err != nil {
		t.Fatal(err)
	}
	_, _, _, _, err := svc.ResolveGoogle(ctx, domain.GoogleProfile{Subject: "sub-1", Email: "nama@example.test", EmailVerified: true, Name: "Nama"}, nil, "10.0.0.2")
	if err == nil || err.Error() != "AUTH_ACCOUNT_LINK_REQUIRED" {
		t.Fatalf("got %v", err)
	}
}

func TestGoogleCreatesOnceThenReuses(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()
	profile := domain.GoogleProfile{Subject: "sub-9", Email: "baru@example.test", EmailVerified: true, Name: "Baru"}
	u1, _, _, _, err := svc.ResolveGoogle(ctx, profile, nil, "10.0.0.3")
	if err != nil {
		t.Fatal(err)
	}
	u2, _, _, _, err := svc.ResolveGoogle(ctx, profile, nil, "10.0.0.3")
	if err != nil {
		t.Fatal(err)
	}
	if u1.ID != u2.ID {
		t.Fatal("duplicate google user")
	}
}

func TestRevokeRejectsOldSession(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()
	if _, err := svc.Register(ctx, "Nama User", "namauser", "nama@example.test", "password12", "password12", "10.0.0.4"); err != nil {
		t.Fatal(err)
	}
	user, _, raw, _, err := svc.Login(ctx, "namauser", "password12", "10.0.0.4", domain.PortalBuyer)
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.RevokeAll(ctx, user); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.SessionFromToken(ctx, raw); err == nil {
		t.Fatal("revoked session must die")
	}
}

type stubOrgStatus struct {
	status string
}

func (s stubOrgStatus) LookupOrganizerStatus(_ context.Context, _ string) (string, bool, error) {
	if s.status == "" {
		return "", false, nil
	}
	return s.status, true, nil
}

func TestApprovedOrganizerCannotLoginAsBuyer(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()
	u, err := svc.Register(ctx, "Nama User", "namauser", "nama@example.test", "password12", "password12", "10.0.0.5")
	if err != nil {
		t.Fatal(err)
	}
	svc.Organizers = stubOrgStatus{status: "APPROVED"}
	_, _, _, _, err = svc.Login(ctx, u.Username, "password12", "10.0.0.5", domain.PortalBuyer)
	if !errors.Is(err, domain.ErrPortalDenied) {
		t.Fatalf("buyer portal: %v", err)
	}
	_, _, _, _, err = svc.Login(ctx, u.Username, "password12", "10.0.0.5", domain.PortalOrganizer)
	if err != nil {
		t.Fatal(err)
	}
}

func TestBuyerCannotLoginAsOrganizerUntilApproved(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()
	u, err := svc.Register(ctx, "Nama User", "pembeli", "pembeli@example.test", "password12", "password12", "10.0.0.6")
	if err != nil {
		t.Fatal(err)
	}
	_, _, _, _, err = svc.Login(ctx, u.Username, "password12", "10.0.0.6", domain.PortalOrganizer)
	if !errors.Is(err, domain.ErrPortalDenied) {
		t.Fatalf("organizer portal: %v", err)
	}
	var pe domain.PortalDeniedError
	if !errors.As(err, &pe) || pe.Reason != domain.PortalDeniedApplyAfterLogin {
		t.Fatalf("reason %+v", pe)
	}
}
