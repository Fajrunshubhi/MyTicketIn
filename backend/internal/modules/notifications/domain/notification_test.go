package domain

import "testing"

func TestSafeActionPathRejectsExternal(t *testing.T) {
	if SafeActionPath("https://evil.example/x") != "" || SafeActionPath("//evil") != "" {
		t.Fatal("external")
	}
	if SafeActionPath("/tickets") != "/tickets" {
		t.Fatal("relative")
	}
}
