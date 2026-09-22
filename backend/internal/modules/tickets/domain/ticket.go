package domain

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
)

type Status string
type CancelSource string
type IssuanceStatus string

const (
	StatusUnused    Status = "UNUSED"
	StatusUsed      Status = "USED"
	StatusCancelled Status = "CANCELLED"

	CancelEvent  CancelSource = "EVENT_CANCELLED"
	CancelRefund CancelSource = "REFUND_COMPLETED"

	IssuanceStarted   IssuanceStatus = "STARTED"
	IssuanceCompleted IssuanceStatus = "COMPLETED"
	IssuanceFailed    IssuanceStatus = "FAILED"

	TokenPrefix = "ti1_"
)

var (
	ErrNotFound          = errors.New("TICKET_NOT_FOUND")
	ErrNotIssued         = errors.New("TICKET_NOT_ISSUED")
	ErrIssuanceInvariant = errors.New("TICKET_ISSUANCE_INVARIANT")
	ErrTokenCollision    = errors.New("TICKET_TOKEN_COLLISION")
	ErrCryptoFailed      = errors.New("TICKET_CRYPTO_FAILED")
	ErrQRUnavailable     = errors.New("TICKET_QR_UNAVAILABLE")
	ErrCancelled         = errors.New("TICKET_CANCELLED")
	ErrAccessDenied      = errors.New("TICKET_ACCESS_DENIED")
	ErrRateLimited       = errors.New("RATE_LIMITED")
	ErrJobUnauthorized   = errors.New("TICKET_JOB_UNAUTHORIZED")
)

type Ticket struct {
	ID                      string
	TicketNumber            string
	ManualCode              string
	OrderID                 string
	OrderItemID             string
	EventID                 string
	TicketTypeID            string
	TicketTypeName          string
	SectionName             *string
	SeatLabel               *string
	EventSeatID             *string
	OwnerUserID             string
	HolderFullName          string
	HolderEmail             string
	HolderPhone             string
	HolderIdentityNumber    string
	UnitSequence            int
	Status                  Status
	TokenHash               string
	TokenCiphertext         []byte
	TokenNonce              []byte
	TokenAuthTag            []byte
	TokenKeyVersion         int
	IssuedAt                time.Time
	UsedAt                  *time.Time
	CancelledAt             *time.Time
	CancellationSource      *CancelSource
	CancellationReferenceID *string
	CreatedAt               time.Time
	UpdatedAt               time.Time
	Version                 int
}

type IssuanceRun struct {
	ID               string
	OrderID          string
	Status           IssuanceStatus
	ExpectedQuantity int
	IssuedQuantity   int
	StartedAt        time.Time
	CompletedAt      *time.Time
	FailureCode      *string
	CorrelationID    string
}

type Crypto struct {
	Pepper        string
	ActiveVersion int
	Keys          map[int][]byte
}

func (c Crypto) Hash(token string) string {
	sum := sha256.Sum256([]byte(token + c.Pepper))
	return hex.EncodeToString(sum[:])
}

func (c Crypto) Encrypt(ticketID, token string) (ciphertext, nonce, tag []byte, version int, err error) {
	key, ok := c.Keys[c.ActiveVersion]
	if !ok || len(key) != 32 {
		return nil, nil, nil, 0, ErrCryptoFailed
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, nil, nil, 0, ErrCryptoFailed
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil || gcm.NonceSize() != 12 {
		return nil, nil, nil, 0, ErrCryptoFailed
	}
	nonce = make([]byte, 12)
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, nil, nil, 0, ErrCryptoFailed
	}
	sealed := gcm.Seal(nil, nonce, []byte(token), []byte(ticketID))
	if len(sealed) < 16 {
		return nil, nil, nil, 0, ErrCryptoFailed
	}
	return sealed[:len(sealed)-16], nonce, sealed[len(sealed)-16:], c.ActiveVersion, nil
}

func (c Crypto) Decrypt(ticketID string, version int, ciphertext, nonce, tag []byte) (string, error) {
	key, ok := c.Keys[version]
	if !ok || len(key) != 32 || len(nonce) != 12 || len(tag) != 16 {
		return "", ErrCryptoFailed
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", ErrCryptoFailed
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", ErrCryptoFailed
	}
	plain, err := gcm.Open(nil, nonce, append(append([]byte{}, ciphertext...), tag...), []byte(ticketID))
	if err != nil {
		return "", ErrCryptoFailed
	}
	token := string(plain)
	if !strings.HasPrefix(token, TokenPrefix) {
		return "", ErrCryptoFailed
	}
	return token, nil
}

func NewToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, raw); err != nil {
		return "", ErrCryptoFailed
	}
	return TokenPrefix + base64.RawURLEncoding.EncodeToString(raw), nil
}

func NewManualCode() (string, error) {
	raw := make([]byte, 10)
	if _, err := io.ReadFull(rand.Reader, raw); err != nil {
		return "", ErrCryptoFailed
	}
	enc := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(raw)
	enc = strings.ToUpper(strings.ReplaceAll(enc, "O", "0"))
	if len(enc) < 16 {
		enc += strings.Repeat("0", 16-len(enc))
	}
	return enc[:16], nil
}

func TicketNumber(id string) string {
	clean := strings.ToUpper(strings.ReplaceAll(id, "-", ""))
	if len(clean) > 12 {
		clean = clean[:12]
	}
	return "TIX-" + clean
}

func ParseKeys(raw string, active int) (map[int][]byte, error) {
	out := map[int][]byte{}
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		ver, key, ok := strings.Cut(part, ":")
		if !ok {
			return nil, fmt.Errorf("QR_ENCRYPTION_KEYS")
		}
		n, err := strconv.Atoi(strings.TrimSpace(ver))
		if err != nil || n <= 0 {
			return nil, fmt.Errorf("QR_ENCRYPTION_KEYS")
		}
		kb, err := decodeKey(strings.TrimSpace(key))
		if err != nil || len(kb) != 32 {
			return nil, fmt.Errorf("QR_ENCRYPTION_KEYS")
		}
		out[n] = kb
	}
	if _, ok := out[active]; !ok {
		return nil, fmt.Errorf("QR_ACTIVE_KEY_VERSION")
	}
	return out, nil
}

func decodeKey(raw string) ([]byte, error) {
	if b, err := hex.DecodeString(raw); err == nil && len(b) == 32 {
		return b, nil
	}
	return base64.RawStdEncoding.DecodeString(raw)
}

func FormatManual(code string) string {
	var b strings.Builder
	for i, r := range strings.TrimSpace(code) {
		if i > 0 && i%4 == 0 {
			b.WriteByte(' ')
		}
		b.WriteRune(r)
	}
	return b.String()
}
