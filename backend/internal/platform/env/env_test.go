package env

import (
	"os"
	"strings"
	"testing"
)

func setRequired(t *testing.T) {
	t.Helper()
	t.Setenv("APP_ENV", "development")
	t.Setenv("API_ADDR", ":8080")
	t.Setenv("WEB_ORIGIN", "http://localhost:3000")
	t.Setenv("SESSION_SECRET", "dev-session-secret")
	t.Setenv("DATABASE_URL", "postgresql://u:p@ep-dev.example/myticketin_dev")
	t.Setenv("DATABASE_URL_UNPOOLED", "postgresql://u:p@ep-dev.example/myticketin_dev")
	t.Setenv("BUILD_VERSION", "")
	t.Setenv("AI_POSTER_SUGGESTIONS_ENABLED", "false")
	t.Setenv("AI_CATALOG_FILTER_ENABLED", "false")
}

func TestLoadRejectsUnknownEnv(t *testing.T) {
	setRequired(t)
	t.Setenv("APP_ENV", "production")
	if _, err := Load(); err == nil {
		t.Fatal("expected CONFIG_INVALID")
	}
}

func TestLoadRejectsMissingRequired(t *testing.T) {
	setRequired(t)
	t.Setenv("DATABASE_URL", "")
	_, err := Load()
	if err == nil {
		t.Fatal("expected CONFIG_INVALID")
	}
	if got := err.Error(); !strings.Contains(got, "CONFIG_INVALID") || !strings.Contains(got, "DATABASE_URL") {
		t.Fatalf("unexpected error %q", got)
	}
}

func TestLoadRejectsEnabledCatalogAIWithoutGate(t *testing.T) {
	setRequired(t)
	t.Setenv("AI_CATALOG_FILTER_ENABLED", "true")
	if _, err := Load(); err == nil {
		t.Fatal("expected AI_CATALOG_FILTER_ENABLED rejected")
	}
}

func TestLoadDevelopmentOK(t *testing.T) {
	setRequired(t)
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.APIAddr != ":8080" || cfg.Version != "dev" {
		t.Fatalf("unexpected cfg %#v", cfg)
	}
	if len(cfg.QRTokenPepper) < 32 || cfg.QREncryptionKeys == "" || cfg.QRActiveKeyVersion != 1 {
		t.Fatalf("expected derived QR secrets %#v", cfg)
	}
}

func TestLoadPreviewRequiresQRSecrets(t *testing.T) {
	setRequired(t)
	t.Setenv("APP_ENV", "preview")
	t.Setenv("SCHEDULER_SECRET", "abcdefghijklmnopqrstuvwxyz012345")
	t.Setenv("PAYMENT_WEBHOOK_SECRET", "abcdefghijklmnopqrstuvwxyz012345")
	if _, err := Load(); err == nil {
		t.Fatal("expected QR secrets required")
	}
}

func TestLoadProductionDemoRejectsLocalhostAndShortSecret(t *testing.T) {
	setRequired(t)
	t.Setenv("APP_ENV", "production-demo")
	t.Setenv("WEB_ORIGIN", "https://demo.myticketin.example")
	t.Setenv("SESSION_SECRET", "too-short")
	t.Setenv("DATABASE_URL", "postgresql://u:p@ep.example/myticketin")
	t.Setenv("DATABASE_URL_UNPOOLED", "postgresql://u:p@ep.example/myticketin")
	if _, err := Load(); err == nil {
		t.Fatal("expected SESSION_SECRET invalid")
	}

	t.Setenv("SESSION_SECRET", "abcdefghijklmnopqrstuvwxyz012345")
	t.Setenv("WEB_ORIGIN", "http://localhost:3000")
	if _, err := Load(); err == nil {
		t.Fatal("expected localhost rejected")
	}
}

func TestLoadProductionDemoRejectsDevMarker(t *testing.T) {
	setRequired(t)
	t.Setenv("APP_ENV", "production-demo")
	t.Setenv("WEB_ORIGIN", "https://demo.myticketin.example")
	t.Setenv("SESSION_SECRET", "abcdefghijklmnopqrstuvwxyz012345")
	t.Setenv("DATABASE_URL", "postgresql://u:p@ep.example/myticketin_dev")
	t.Setenv("DATABASE_URL_UNPOOLED", "postgresql://u:p@ep.example/myticketin_dev")
	if _, err := Load(); err == nil {
		t.Fatal("expected isolation marker rejected")
	}
}

func TestF61EnvIdentitiesDiffer(t *testing.T) {
	dev, err := DatabaseIdentity("postgresql://u:p@ep-dev.example/myticketin_dev")
	if err != nil {
		t.Fatal(err)
	}
	testID, err := DatabaseIdentity("postgresql://u:p@ep-test.example/myticketin_test")
	if err != nil {
		t.Fatal(err)
	}
	preview, err := DatabaseIdentity("postgresql://u:p@ep-preview.example/myticketin_preview")
	if err != nil {
		t.Fatal(err)
	}
	if !IsolatedIdentities(dev, testID, preview) {
		t.Fatal("expected distinct database identities")
	}
	if IsolatedIdentities(dev, dev) {
		t.Fatal("same identity must not isolate")
	}
}

func TestLoadRejectsProductionPaymentCredentials(t *testing.T) {
	setRequired(t)
	t.Setenv("MIDTRANS_SERVER_KEY", "SB-Mid-server-example")
	if _, err := Load(); err == nil {
		t.Fatal("expected production payment credential rejected")
	}
}

func TestLoadRejectsPosterAIWithoutApprovedGate(t *testing.T) {
	setRequired(t)
	t.Setenv("AI_POSTER_SUGGESTIONS_ENABLED", "true")
	if _, err := Load(); err == nil {
		t.Fatal("expected CONFIG_INVALID")
	}
}

func TestLoadGoogleCredentialsMustBePaired(t *testing.T) {
	setRequired(t)
	t.Setenv("GOOGLE_CLIENT_ID", "only-id")
	t.Setenv("GOOGLE_CLIENT_SECRET", "")
	if _, err := Load(); err == nil {
		t.Fatal("expected CONFIG_INVALID")
	}
}

func TestLoadEnvFileDoesNotOverride(t *testing.T) {
	t.Setenv("SESSION_SECRET", "from-process")
	dir := t.TempDir()
	path := dir + "/.env.local"
	if err := os.WriteFile(path, []byte("SESSION_SECRET=from-file\nAPP_ENV=test\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	loadEnvFile(path)
	if os.Getenv("SESSION_SECRET") != "from-process" {
		t.Fatal("must not overwrite existing env")
	}
}

func TestLoadRejectsNonSandboxEmailProvider(t *testing.T) {
	setRequired(t)
	t.Setenv("EMAIL_PROVIDER", "resend")
	if _, err := Load(); err == nil {
		t.Fatal("expected EMAIL_PROVIDER rejected")
	}
}

func TestLoadDefaultsSandboxEmailProvider(t *testing.T) {
	setRequired(t)
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.EmailProvider != "sandbox" {
		t.Fatalf("got %q", cfg.EmailProvider)
	}
}

func TestLoadAPIAddrFromPORT(t *testing.T) {
	setRequired(t)
	t.Setenv("API_ADDR", "")
	t.Setenv("PORT", "8080")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.APIAddr != ":8080" {
		t.Fatalf("got %q", cfg.APIAddr)
	}
}
