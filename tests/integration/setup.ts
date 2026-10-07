import { existsSync, readFileSync } from "fs";
import path from "path";

function loadTestEnvFile() {
  const file = path.resolve(process.cwd(), ".env.test.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

loadTestEnvFile();

const url = String(process.env.TEST_DATABASE_URL || "");
if (!/^postgres(ql)?:\/\//.test(url)) {
  throw new Error("TEST_DATABASE_URL is required for integration tests (see .env.test.local).");
}
if (String(process.env.DATABASE_URL || "") && process.env.DATABASE_URL !== url && process.env.ALLOW_DB_URL_OVERRIDE !== "1") {
  // vitest does not load .env.local, so this only triggers if the shell exported a different DATABASE_URL.
  throw new Error("Refusing to run: DATABASE_URL is set to a different database than TEST_DATABASE_URL.");
}

process.env.DATABASE_URL = url;
// Never send real email or use real provider credentials from tests.
process.env.EMAIL_PROVIDER = "sandbox";
process.env.RESEND_API_KEY = "";
process.env.EMAIL_SMTP_HOST = "";
process.env.SESSION_SECRET ||= "integration-test-session-secret-0123456789";
process.env.QR_ENCRYPTION_KEYS ||= "integration-test-qr-key-0123456789abcdef";
process.env.PAYMENT_WEBHOOK_SECRET = "integration-test-webhook-secret";
process.env.DOCUMENT_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
