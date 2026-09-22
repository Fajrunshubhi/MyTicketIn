package application

import "testing"

func TestValidateRegister(t *testing.T) {
	err := ValidateRegister("Na", "ab", "bad", "short", "nope")
	ve, ok := err.(ValidationError)
	if !ok {
		t.Fatalf("expected ValidationError")
	}
	if len(ve.Fields) == 0 {
		t.Fatal("expected field errors")
	}
	if err := ValidateRegister("Nama Lengkap", "user.name", "user@example.test", "password12", "password12"); err != nil {
		t.Fatal(err)
	}
}

func TestSafeCallbackPath(t *testing.T) {
	if SafeCallbackPath("https://evil.example/phish", "/home") != "/home" {
		t.Fatal("open redirect")
	}
	if SafeCallbackPath("//evil.example", "/home") != "/home" {
		t.Fatal("protocol-relative")
	}
	if SafeCallbackPath("/home", "/home") != "/home" {
		t.Fatal("same-origin path")
	}
}

func TestHashRateKeyDoesNotEmbedRawTogetherUnhashedHint(t *testing.T) {
	a := HashRateKey("login", "1.1.1.1", "Ada@Example.test")
	b := HashRateKey("login", "1.1.1.1", "ada@example.test")
	if a != b {
		t.Fatal("identifier must be normalized")
	}
}
