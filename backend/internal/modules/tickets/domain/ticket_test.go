package domain

import "testing"

func TestTokenHashEncryptDecrypt(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 3)
	}
	c := Crypto{Pepper: "pepper-value-32-chars-minimum-ok!", ActiveVersion: 1, Keys: map[int][]byte{1: key}}
	tok, err := NewToken()
	if err != nil || len(tok) < 40 {
		t.Fatal(tok, err)
	}
	hash := c.Hash(tok)
	if len(hash) != 64 {
		t.Fatal(hash)
	}
	ct, nonce, tag, ver, err := c.Encrypt("ticket-id-1", tok)
	if err != nil || ver != 1 || len(nonce) != 12 || len(tag) != 16 {
		t.Fatal(err, ver, len(nonce), len(tag))
	}
	got, err := c.Decrypt("ticket-id-1", ver, ct, nonce, tag)
	if err != nil || got != tok {
		t.Fatal(got, err)
	}
	if _, err := c.Decrypt("other-ticket", ver, ct, nonce, tag); err != ErrCryptoFailed {
		t.Fatal("aad")
	}
	ct[0] ^= 1
	if _, err := c.Decrypt("ticket-id-1", ver, ct, nonce, tag); err != ErrCryptoFailed {
		t.Fatal("tamper")
	}
}

func TestParseKeysAndManual(t *testing.T) {
	key := make([]byte, 32)
	raw := "1:" + encodeHex(key)
	m, err := ParseKeys(raw, 1)
	if err != nil || len(m[1]) != 32 {
		t.Fatal(err, m)
	}
	code, err := NewManualCode()
	if err != nil || len(code) != 16 {
		t.Fatal(code, err)
	}
	if FormatManual("ABCD1234WXYZ9876") != "ABCD 1234 WXYZ 9876" {
		t.Fatal(FormatManual("ABCD1234WXYZ9876"))
	}
}

func encodeHex(b []byte) string {
	const hex = "0123456789abcdef"
	out := make([]byte, len(b)*2)
	for i, v := range b {
		out[i*2] = hex[v>>4]
		out[i*2+1] = hex[v&0x0f]
	}
	return string(out)
}
