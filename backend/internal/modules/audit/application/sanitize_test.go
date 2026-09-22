package application

import (
	"fmt"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
)

func TestSanitizeDropsNestedSecretsAndEmail(t *testing.T) {
	got, err := SanitizeMap(map[string]any{
		"id":    "u1",
		"email": "a@b.test",
		"nested": map[string]any{
			"passwordHash": "secret",
			"ok":           "visible",
			"oauthToken":   "tok",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := got["email"]; ok {
		t.Fatal("email must be dropped")
	}
	nested, _ := got["nested"].(map[string]any)
	if _, ok := nested["passwordHash"]; ok {
		t.Fatal("password must be dropped")
	}
	if _, ok := nested["oauthToken"]; ok {
		t.Fatal("token must be dropped")
	}
	if nested["ok"] != "visible" {
		t.Fatalf("%v", nested)
	}
}

func TestSanitizeTruncatesAndCapsJSON(t *testing.T) {
	long := strings.Repeat("x", 800)
	got, err := SanitizeMap(map[string]any{"note": long})
	if err != nil {
		t.Fatal(err)
	}
	if utf8.RuneCountInString(got["note"].(string)) != 500 {
		t.Fatalf("len %d", utf8.RuneCountInString(got["note"].(string)))
	}
	huge := map[string]any{}
	for i := 0; i < 40; i++ {
		huge[fmt.Sprintf("field%02d", i)] = strings.Repeat("z", 500)
	}
	if _, err := SanitizeMap(huge); err == nil {
		t.Fatal("expected size cap")
	}
}

func TestCursorRoundTrip(t *testing.T) {
	secret := "test-secret"
	now, err := time.Parse(time.RFC3339Nano, "2026-09-21T10:00:00.123456789Z")
	if err != nil {
		t.Fatal(err)
	}
	tok := EncodeCursor(secret, now, "id-1")
	gotT, gotID, err := DecodeCursor(secret, tok)
	if err != nil || gotID != "id-1" || !gotT.Equal(now) {
		t.Fatalf("%v %s %s", err, gotT, gotID)
	}
	if _, _, err := DecodeCursor("other", tok); err != ErrCursorInvalid {
		t.Fatalf("tamper: %v", err)
	}
}
