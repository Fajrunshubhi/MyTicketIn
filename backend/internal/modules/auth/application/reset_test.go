package application

import (
	"context"
	"testing"

	"myticketin/internal/modules/auth/domain"
)

func TestPasswordResetGenericAndSingleUse(t *testing.T) {
	mem := NewMemory()
	svc := NewService(mem, mem, mem, StaticHasher{
		HashFn:    func(p string) (string, error) { return "h:" + p, nil },
		CompareFn: func(hash, password string) bool { return hash == "h:"+password },
	})
	svc.Resets = mem
	svc.Dummy = "h:dummy"
	user, err := svc.Register(context.Background(), "Ada Pembeli", "ada", "ada@example.test", "password123", "password123", "1.1.1.1")
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.RequestPasswordReset(context.Background(), "missing@example.test", "9.9.9.9"); err != nil {
		t.Fatal(err)
	}
	raw, err := svc.AssistPasswordReset(context.Background(), domain.User{ID: "admin", Role: domain.RoleAdmin, Status: domain.StatusActive}, user.ID, "Reset demo untuk pengujian akun lokal.")
	if err != nil || raw == "" {
		t.Fatal(err, raw)
	}
	if err := svc.ConfirmPasswordReset(context.Background(), raw, "password4567", "password4567"); err != nil {
		t.Fatal(err)
	}
	if err := svc.ConfirmPasswordReset(context.Background(), raw, "password4567", "password4567"); err == nil {
		t.Fatal("replay")
	}
}
