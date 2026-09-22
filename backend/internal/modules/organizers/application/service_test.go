package application

import (
	"context"
	"testing"

	authdomain "myticketin/internal/modules/auth/domain"
	"myticketin/internal/modules/organizers/domain"
)

func TestSubmitDuplicateAndRejectedEditResubmit(t *testing.T) {
	svc := NewService(NewMemory())
	ctx := context.Background()
	actor := authdomain.User{ID: "u1", Role: authdomain.RoleUser, Status: authdomain.StatusActive}
	p, err := svc.Submit(ctx, actor, "Organizer Satu", "org@example.test", "", "Deskripsi organizer yang cukup panjang.", "1.1.1.1")
	if err != nil {
		t.Fatal(err)
	}
	if p.Status != domain.StatusPending {
		t.Fatalf("%s", p.Status)
	}
	id, status, can, err := svc.Capabilities(ctx, actor)
	if err != nil || can || status != domain.StatusPending || id != p.ID {
		t.Fatalf("%v %s %v %s", err, status, can, id)
	}
	if _, err := svc.RequireApprovedOrganizer(ctx, actor.ID); err != domain.ErrNotApproved {
		t.Fatalf("%v", err)
	}
	if _, err := svc.Submit(ctx, actor, "Organizer Satu", "org@example.test", "", "Deskripsi organizer yang cukup panjang.", "1.1.1.1"); err != domain.ErrExists {
		t.Fatalf("dup %v", err)
	}
	if _, err := svc.Edit(ctx, actor, "Organizer Satu", "org@example.test", "", "Deskripsi organizer yang cukup panjang.", p.Version); err != domain.ErrPending {
		t.Fatalf("edit pending %v", err)
	}

	admin := authdomain.User{ID: "adm", Role: authdomain.RoleAdmin, Status: authdomain.StatusActive}
	rejected, err := svc.Decide(ctx, admin, p.ID, domain.DecisionReject, "Nama dan deskripsi belum lengkap.", p.Version)
	if err != nil {
		t.Fatal(err)
	}
	edited, err := svc.Edit(ctx, actor, "Organizer Dua", "org@example.test", "+62811111111", "Deskripsi organizer yang diperbarui secara lengkap.", rejected.Version)
	if err != nil || edited.Status != domain.StatusRejected {
		t.Fatalf("edit rejected %v %+v", err, edited)
	}
	pending, err := svc.Resubmit(ctx, actor, edited.Version)
	if err != nil || pending.Status != domain.StatusPending || pending.DecisionReason != nil {
		t.Fatalf("resubmit %v %+v", err, pending)
	}
	approved, err := svc.Decide(ctx, admin, pending.ID, domain.DecisionApprove, "Profil memenuhi syarat moderasi.", pending.Version)
	if err != nil {
		t.Fatal(err)
	}
	_, _, can, err = svc.Capabilities(ctx, actor)
	if err != nil || !can {
		t.Fatalf("cap %v %v", err, can)
	}
	oid, err := svc.RequireApprovedOrganizer(ctx, actor.ID)
	if err != nil || oid != approved.ID {
		t.Fatalf("req %v %s", err, oid)
	}
	suspended, err := svc.Decide(ctx, admin, approved.ID, domain.DecisionSuspend, "Pelanggaran kebijakan platform.", approved.Version)
	if err != nil || suspended.Status != domain.StatusSuspended {
		t.Fatalf("suspend %v %+v", err, suspended)
	}
	_, _, can, _ = svc.Capabilities(ctx, actor)
	if can {
		t.Fatal("suspend must drop capability")
	}
	other := authdomain.User{ID: "u2", Role: authdomain.RoleUser, Status: authdomain.StatusActive}
	if _, err := svc.GetOwn(ctx, other); err != domain.ErrNotFound {
		t.Fatalf("other %v", err)
	}
}

func TestOwnerCannotReadForeignProfile(t *testing.T) {
	mem := NewMemory()
	svc := NewService(mem)
	ctx := context.Background()
	a := authdomain.User{ID: "a", Role: authdomain.RoleUser, Status: authdomain.StatusActive}
	b := authdomain.User{ID: "b", Role: authdomain.RoleUser, Status: authdomain.StatusActive}
	p, err := svc.Submit(ctx, a, "Organizer Axx", "a@example.test", "", "Deskripsi organizer yang cukup panjang.", "2.2.2.2")
	if err != nil {
		t.Fatal(err)
	}
	got, err := svc.GetOwn(ctx, b)
	if err != domain.ErrNotFound {
		t.Fatalf("got %+v %v", got, err)
	}
	if err := svc.Policies.Authorize(authdomain.Actor{User: b}, authdomain.ActionOrganizerOwn, authdomain.Resource{ID: p.ID, OwnerID: p.OwnerUserID}); err != authdomain.ErrForbidden {
		t.Fatalf("policy %v", err)
	}
}

func TestConcurrentApproveOneWins(t *testing.T) {
	svc := NewService(NewMemory())
	ctx := context.Background()
	actor := authdomain.User{ID: "u1", Role: authdomain.RoleUser, Status: authdomain.StatusActive}
	admin := authdomain.User{ID: "adm", Role: authdomain.RoleAdmin, Status: authdomain.StatusActive}
	p, err := svc.Submit(ctx, actor, "Organizer Satu", "org@example.test", "", "Deskripsi organizer yang cukup panjang.", "1.1.1.1")
	if err != nil {
		t.Fatal(err)
	}
	ch := make(chan error, 2)
	for i := 0; i < 2; i++ {
		go func() {
			_, e := svc.Decide(ctx, admin, p.ID, domain.DecisionApprove, "Profil memenuhi syarat moderasi.", p.Version)
			ch <- e
		}()
	}
	e1, e2 := <-ch, <-ch
	if (e1 == nil) == (e2 == nil) {
		t.Fatalf("expected one success one failure, got %v %v", e1, e2)
	}
}
