package domain

import "testing"

func TestAuthorizeDefaultDeny(t *testing.T) {
	reg := NewRegistry()
	user := Actor{User: User{ID: "a", Role: RoleUser, Status: StatusActive}}
	admin := Actor{User: User{ID: "adm", Role: RoleAdmin, Status: StatusActive}}
	other := Resource{Kind: "user", ID: "b", OwnerID: "b"}
	self := Resource{Kind: "user", ID: "a", OwnerID: "a"}

	if err := reg.Authorize(user, ActionAdminPing, Resource{}); err != ErrForbidden {
		t.Fatalf("USER must not access admin: %v", err)
	}
	if err := reg.Authorize(admin, ActionAdminPing, Resource{}); err != nil {
		t.Fatal(err)
	}
	if err := reg.Authorize(user, ActionViewProfile, other); err != ErrForbidden {
		t.Fatalf("user A must not read user B: %v", err)
	}
	if err := reg.Authorize(user, ActionViewProfile, self); err != nil {
		t.Fatal(err)
	}
	if err := reg.Authorize(user, ActionAdminAudit, Resource{}); err != ErrForbidden {
		t.Fatalf("USER must not read audit: %v", err)
	}
	if err := reg.Authorize(admin, ActionAdminOrganizer, Resource{}); err != nil {
		t.Fatal(err)
	}
	if err := reg.Authorize(user, ActionAdminOrganizer, Resource{}); err != ErrForbidden {
		t.Fatalf("USER must not moderate organizers: %v", err)
	}
	if err := reg.Authorize(admin, ActionAdminEvent, Resource{}); err != nil {
		t.Fatal(err)
	}
	if err := reg.Authorize(user, ActionAdminEvent, Resource{}); err != ErrForbidden {
		t.Fatalf("USER must not moderate events: %v", err)
	}
	if err := reg.Authorize(admin, ActionOrganizerApply, Resource{}); err != ErrForbidden {
		t.Fatalf("ADMIN must not apply as organizer: %v", err)
	}
}

func TestAuthorizeUnknownPolicyDenied(t *testing.T) {
	reg := NewRegistry()
	actor := Actor{User: User{ID: "a", Role: RoleUser, Status: StatusActive}}
	if err := reg.Authorize(actor, "event.manage", Resource{OwnerID: "a"}); err != ErrForbidden {
		t.Fatalf("missing policy must deny: %v", err)
	}
}

func TestAuthorizeSuspended(t *testing.T) {
	reg := NewRegistry()
	actor := Actor{User: User{ID: "a", Role: RoleUser, Status: StatusSuspended}}
	if err := reg.Authorize(actor, ActionViewProfile, Resource{OwnerID: "a"}); err != ErrAccountSuspended {
		t.Fatalf("got %v", err)
	}
}
