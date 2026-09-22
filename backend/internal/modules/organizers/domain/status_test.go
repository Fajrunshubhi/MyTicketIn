package domain

import "testing"

func TestTransitionMatrix(t *testing.T) {
	cases := []struct {
		from     Status
		decision Decision
		want     Status
		ok       bool
	}{
		{StatusPending, DecisionApprove, StatusApproved, true},
		{StatusPending, DecisionReject, StatusRejected, true},
		{StatusPending, DecisionSuspend, "", false},
		{StatusPending, DecisionRestore, "", false},
		{StatusApproved, DecisionApprove, "", false},
		{StatusApproved, DecisionReject, "", false},
		{StatusApproved, DecisionSuspend, StatusSuspended, true},
		{StatusApproved, DecisionRestore, "", false},
		{StatusRejected, DecisionApprove, "", false},
		{StatusRejected, DecisionReject, "", false},
		{StatusRejected, DecisionSuspend, "", false},
		{StatusRejected, DecisionRestore, "", false},
		{StatusSuspended, DecisionApprove, "", false},
		{StatusSuspended, DecisionReject, "", false},
		{StatusSuspended, DecisionSuspend, "", false},
		{StatusSuspended, DecisionRestore, StatusApproved, true},
	}
	for _, tc := range cases {
		got, err := TargetStatus(tc.from, tc.decision)
		if tc.ok {
			if err != nil || got != tc.want {
				t.Fatalf("%s %s: got %s %v", tc.from, tc.decision, got, err)
			}
		} else if err != ErrTransitionInvalid {
			t.Fatalf("%s %s expected invalid, got %s %v", tc.from, tc.decision, got, err)
		}
	}
	if CanOwnerEdit(StatusPending) || CanOwnerResubmit(StatusApproved) || CanOwnerEdit(StatusSuspended) {
		t.Fatal("only rejected may edit/resubmit")
	}
	if !CanOwnerEdit(StatusRejected) || !CanOwnerResubmit(StatusRejected) {
		t.Fatal("rejected must edit/resubmit")
	}
	if HasOrganizerCapability(StatusPending) || HasOrganizerCapability(StatusRejected) || HasOrganizerCapability(StatusSuspended) {
		t.Fatal("only approved has capability")
	}
	if !HasOrganizerCapability(StatusApproved) {
		t.Fatal("approved capability")
	}
}

func TestAllowedDecisions(t *testing.T) {
	if n := len(AllowedDecisions(StatusPending)); n != 2 {
		t.Fatalf("pending %d", n)
	}
	if AllowedDecisions(StatusApproved)[0] != DecisionSuspend {
		t.Fatal("approved")
	}
	if len(AllowedDecisions(StatusRejected)) != 0 {
		t.Fatal("rejected")
	}
}
