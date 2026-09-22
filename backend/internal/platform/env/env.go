package env

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

var ErrConfigInvalid = errors.New("CONFIG_INVALID")

type Config struct {
	AppEnv                string
	APIAddr               string
	WebOrigin             string
	SessionSecret         string
	DatabaseURL           string
	DatabaseURLUnpooled   string
	Version               string
	GoogleClientID        string
	GoogleClientSecret    string
	GoogleRedirectURI     string
	SchedulerSecret       string
	PaymentWebhookSecret  string
	QRTokenPepper         string
	QREncryptionKeys      string
	QRActiveKeyVersion    int
	CheckinFingerprintKey string
	EnableSalesTrend      bool
	EnableAdminSearch     bool
	EmailProvider         string
}

var requiredKeys = []string{
	"APP_ENV",
	"API_ADDR",
	"WEB_ORIGIN",
	"SESSION_SECRET",
	"DATABASE_URL",
	"DATABASE_URL_UNPOOLED",
}

func Load() (Config, error) {
	applyDotEnv()
	cfg := Config{
		AppEnv:                strings.TrimSpace(os.Getenv("APP_ENV")),
		APIAddr:               strings.TrimSpace(os.Getenv("API_ADDR")),
		WebOrigin:             strings.TrimSpace(os.Getenv("WEB_ORIGIN")),
		SessionSecret:         strings.TrimSpace(os.Getenv("SESSION_SECRET")),
		DatabaseURL:           strings.TrimSpace(os.Getenv("DATABASE_URL")),
		DatabaseURLUnpooled:   strings.TrimSpace(os.Getenv("DATABASE_URL_UNPOOLED")),
		Version:               strings.TrimSpace(os.Getenv("BUILD_VERSION")),
		GoogleClientID:        strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_ID")),
		GoogleClientSecret:    strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_SECRET")),
		GoogleRedirectURI:     strings.TrimSpace(os.Getenv("GOOGLE_REDIRECT_URI")),
		SchedulerSecret:       strings.TrimSpace(os.Getenv("SCHEDULER_SECRET")),
		PaymentWebhookSecret:  strings.TrimSpace(os.Getenv("PAYMENT_WEBHOOK_SECRET")),
		QRTokenPepper:         strings.TrimSpace(os.Getenv("QR_TOKEN_PEPPER")),
		QREncryptionKeys:      strings.TrimSpace(os.Getenv("QR_ENCRYPTION_KEYS")),
		QRActiveKeyVersion:    0,
		CheckinFingerprintKey: strings.TrimSpace(os.Getenv("CHECKIN_FINGERPRINT_KEY")),
		EnableSalesTrend:      strings.EqualFold(strings.TrimSpace(os.Getenv("ENABLE_SALES_TREND")), "true"),
		EnableAdminSearch:     strings.EqualFold(strings.TrimSpace(os.Getenv("ENABLE_ADMIN_SEARCH")), "true"),
		EmailProvider:         strings.TrimSpace(os.Getenv("EMAIL_PROVIDER")),
	}
	if cfg.Version == "" {
		cfg.Version = "dev"
	}

	missing := missingRequired(cfg)
	if len(missing) > 0 {
		return Config{}, fmt.Errorf("%w: %s", ErrConfigInvalid, strings.Join(missing, ","))
	}

	allowed := map[string]struct{}{
		"development": {}, "test": {}, "preview": {}, "production-demo": {},
	}
	if _, ok := allowed[cfg.AppEnv]; !ok {
		return Config{}, fmt.Errorf("%w: APP_ENV", ErrConfigInvalid)
	}

	if (cfg.GoogleClientID == "") != (cfg.GoogleClientSecret == "") {
		return Config{}, fmt.Errorf("%w: GOOGLE_CLIENT_ID", ErrConfigInvalid)
	}

	if strings.EqualFold(strings.TrimSpace(os.Getenv("AI_POSTER_SUGGESTIONS_ENABLED")), "true") {
		need := []string{"AI_PROVIDER", "AI_MODEL", "AI_MAX_IMAGE_BYTES", "AI_REQUEST_TIMEOUT_MS", "AI_DAILY_BUDGET_RUPIAH"}
		var missingAI []string
		for _, key := range need {
			if strings.TrimSpace(os.Getenv(key)) == "" {
				missingAI = append(missingAI, key)
			}
		}
		if len(missingAI) > 0 {
			return Config{}, fmt.Errorf("%w: %s", ErrConfigInvalid, strings.Join(append([]string{"AI_POSTER_SUGGESTIONS_ENABLED"}, missingAI...), ","))
		}
		return Config{}, fmt.Errorf("%w: AI_POSTER_SUGGESTIONS_ENABLED", ErrConfigInvalid)
	}

	if strings.EqualFold(strings.TrimSpace(os.Getenv("AI_CATALOG_FILTER_ENABLED")), "true") {
		return Config{}, fmt.Errorf("%w: AI_CATALOG_FILTER_ENABLED", ErrConfigInvalid)
	}

	if cfg.SchedulerSecret == "" && (cfg.AppEnv == "development" || cfg.AppEnv == "test") {
		cfg.SchedulerSecret = cfg.SessionSecret
	}
	if cfg.PaymentWebhookSecret == "" && (cfg.AppEnv == "development" || cfg.AppEnv == "test") {
		cfg.PaymentWebhookSecret = cfg.SessionSecret
	}
	if verRaw := strings.TrimSpace(os.Getenv("QR_ACTIVE_KEY_VERSION")); verRaw != "" {
		n, err := strconv.Atoi(verRaw)
		if err != nil || n <= 0 {
			return Config{}, fmt.Errorf("%w: QR_ACTIVE_KEY_VERSION", ErrConfigInvalid)
		}
		cfg.QRActiveKeyVersion = n
	}
	if cfg.QRTokenPepper == "" || cfg.QREncryptionKeys == "" || cfg.QRActiveKeyVersion == 0 {
		if cfg.AppEnv == "development" || cfg.AppEnv == "test" {
			cfg.QRTokenPepper, cfg.QREncryptionKeys, cfg.QRActiveKeyVersion = deriveDevQR(cfg.SessionSecret)
		} else {
			return Config{}, fmt.Errorf("%w: QR_TOKEN_PEPPER", ErrConfigInvalid)
		}
	}
	if len(cfg.QRTokenPepper) < 32 {
		return Config{}, fmt.Errorf("%w: QR_TOKEN_PEPPER", ErrConfigInvalid)
	}
	if cfg.CheckinFingerprintKey == "" {
		if cfg.AppEnv == "development" || cfg.AppEnv == "test" {
			sum := sha256.Sum256([]byte(cfg.SessionSecret + "|checkin-fp"))
			cfg.CheckinFingerprintKey = hex.EncodeToString(sum[:])
		} else {
			return Config{}, fmt.Errorf("%w: CHECKIN_FINGERPRINT_KEY", ErrConfigInvalid)
		}
	}
	if len(cfg.CheckinFingerprintKey) < 32 || cfg.CheckinFingerprintKey == cfg.QRTokenPepper {
		return Config{}, fmt.Errorf("%w: CHECKIN_FINGERPRINT_KEY", ErrConfigInvalid)
	}
	if cfg.AppEnv == "preview" || cfg.AppEnv == "production-demo" {
		if len(cfg.SchedulerSecret) < 32 {
			return Config{}, fmt.Errorf("%w: SCHEDULER_SECRET", ErrConfigInvalid)
		}
		if len(cfg.PaymentWebhookSecret) < 32 {
			return Config{}, fmt.Errorf("%w: PAYMENT_WEBHOOK_SECRET", ErrConfigInvalid)
		}
		if cfg.QRTokenPepper == cfg.SessionSecret || strings.Contains(strings.ToLower(cfg.QRTokenPepper), "test") {
			return Config{}, fmt.Errorf("%w: QR_TOKEN_PEPPER", ErrConfigInvalid)
		}
	}

	if cfg.EmailProvider == "" && (cfg.AppEnv == "development" || cfg.AppEnv == "test") {
		cfg.EmailProvider = "sandbox"
	}
	if cfg.EmailProvider != "sandbox" {
		return Config{}, fmt.Errorf("%w: EMAIL_PROVIDER", ErrConfigInvalid)
	}

	if strings.TrimSpace(os.Getenv("MIDTRANS_SERVER_KEY")) != "" || strings.TrimSpace(os.Getenv("XENDIT_SECRET_KEY")) != "" {
		return Config{}, fmt.Errorf("%w: PRODUCTION_PAYMENT_CREDENTIAL", ErrConfigInvalid)
	}

	if cfg.AppEnv == "production-demo" {
		if len(cfg.SessionSecret) < 32 {
			return Config{}, fmt.Errorf("%w: SESSION_SECRET", ErrConfigInvalid)
		}
		if hasLocalhost(cfg.WebOrigin) || hasLocalhost(cfg.APIAddr) {
			return Config{}, fmt.Errorf("%w: WEB_ORIGIN", ErrConfigInvalid)
		}
		if hasLocalhost(cfg.DatabaseURL) || hasLocalhost(cfg.DatabaseURLUnpooled) {
			return Config{}, fmt.Errorf("%w: DATABASE_URL", ErrConfigInvalid)
		}
		if HasDevTestMarker(cfg.DatabaseURL) || HasDevTestMarker(cfg.DatabaseURLUnpooled) {
			return Config{}, fmt.Errorf("%w: DATABASE_URL", ErrConfigInvalid)
		}
	}

	return cfg, nil
}

func deriveDevQR(sessionSecret string) (string, string, int) {
	pepper := sha256.Sum256([]byte(sessionSecret + "|qr-pepper"))
	key := sha256.Sum256([]byte(sessionSecret + "|qr-enc-v1"))
	return hex.EncodeToString(pepper[:]), "1:" + hex.EncodeToString(key[:]), 1
}

func missingRequired(cfg Config) []string {
	values := map[string]string{
		"APP_ENV":               cfg.AppEnv,
		"API_ADDR":              cfg.APIAddr,
		"WEB_ORIGIN":            cfg.WebOrigin,
		"SESSION_SECRET":        cfg.SessionSecret,
		"DATABASE_URL":          cfg.DatabaseURL,
		"DATABASE_URL_UNPOOLED": cfg.DatabaseURLUnpooled,
	}
	var missing []string
	for _, key := range requiredKeys {
		if values[key] == "" {
			missing = append(missing, key)
		}
	}
	return missing
}

func hasLocalhost(value string) bool {
	lower := strings.ToLower(value)
	return strings.Contains(lower, "localhost") || strings.Contains(lower, "127.0.0.1")
}

// HasDevTestMarker reports isolation markers that must not appear on production-demo databases.
func HasDevTestMarker(rawURL string) bool {
	identity, err := DatabaseIdentity(rawURL)
	if err != nil {
		return true
	}
	lower := strings.ToLower(identity)
	markers := []string{"-dev", "_dev", "/dev", ".dev", "-test", "_test", "/test", ".test"}
	for _, marker := range markers {
		if strings.Contains(lower, marker) {
			return true
		}
	}
	return strings.HasSuffix(lower, "/dev") || strings.HasSuffix(lower, "/test")
}

// DatabaseIdentity returns host/dbname without userinfo or query so environments can be compared.
func DatabaseIdentity(rawURL string) (string, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Host == "" {
		return "", fmt.Errorf("%w: DATABASE_URL", ErrConfigInvalid)
	}
	name := strings.TrimPrefix(parsed.Path, "/")
	if idx := strings.Index(name, "/"); idx >= 0 {
		name = name[:idx]
	}
	if name == "" {
		return "", fmt.Errorf("%w: DATABASE_URL", ErrConfigInvalid)
	}
	return strings.ToLower(parsed.Hostname() + "/" + name), nil
}

// IsolatedIdentities is true when every environment uses a distinct host/database pair.
func IsolatedIdentities(identities ...string) bool {
	seen := make(map[string]struct{}, len(identities))
	for _, id := range identities {
		if id == "" {
			return false
		}
		if _, ok := seen[id]; ok {
			return false
		}
		seen[id] = struct{}{}
	}
	return true
}

func (c Config) GoogleCallbackURL() string {
	if c.GoogleRedirectURI != "" {
		return strings.TrimRight(c.GoogleRedirectURI, "/")
	}
	return strings.TrimRight(c.WebOrigin, "/") + "/api/auth/callback/google"
}
