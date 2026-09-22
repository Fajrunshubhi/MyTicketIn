package domain

import "testing"

func TestMutatableAndSuggestable(t *testing.T) {
	if !Mutatable(StatusDraft) || Mutatable(StatusPendingReview) {
		t.Fatal("only draft is mutable in RFC-005 delete/draft lock")
	}
	if !AuthoringMutable(StatusRejected) || AuthoringMutable(StatusPublished) {
		t.Fatal("rejected authoring")
	}
	if !DetailsEditable(StatusPublished) || DetailsEditable(StatusPendingReview) {
		t.Fatal("published details editable")
	}
	if CanCancel(StatusDraft) || !CanCancel(StatusPublished) {
		t.Fatal("cancel matrix")
	}
	if !IsEventOperator("owner", true, "owner", false) {
		t.Fatal("owner operator")
	}
	if IsEventOperator("owner", true, "other", false) {
		t.Fatal("non-assignee")
	}
	if !IsEventOperator("owner", true, "staff", true) {
		t.Fatal("staff operator")
	}
	if !Mutatable(StatusDraft) || Mutatable(StatusPendingReview) {
		t.Fatal("only draft is mutable in RFC-005")
	}
	if !Suggestable(StatusDraft) || !Suggestable(StatusRejected) || Suggestable(StatusPendingReview) {
		t.Fatal("suggestable statuses")
	}
	if _, err := ParseMode("CLICKABLE"); err != ErrModeMismatch {
		t.Fatalf("%v", err)
	}
	if !AllowedTimezone("Asia/Jakarta") || AllowedTimezone("Europe/London") {
		t.Fatal("tz allowlist")
	}
}

func TestNormalizeTagsAndCoordinates(t *testing.T) {
	got, err := NormalizeTags([]string{" Jakarta Events ", "musik", "musik"})
	if err != nil || len(got) != 2 || got[0] != "jakarta-events" || got[1] != "musik" {
		t.Fatalf("%v %v", got, err)
	}
	if _, err := NormalizeTags([]string{"x"}); err != ErrTagsInvalid {
		t.Fatal(err)
	}
	if !ValidCoordinates(-6.2, 106.8) || ValidCoordinates(100, 0) {
		t.Fatal("coordinates")
	}
}
